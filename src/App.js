// libs
import React, { Component } from 'react'
import * as THREE from 'three'
import GLTFLoader from 'three-gltf-loader'
import OrbitContructor from 'three-orbit-controls'
import deepAssign from 'deep-assign'
import EventEmitter from 'eventemitter3'
import mixin from 'mixin'
import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
import Voronoi from 'voronoi'
import SimplexNoise from 'simplex-noise'
import seedrandom from 'seedrandom'
import { map } from './utils/math'

// post
import {
  EffectComposer,
  // ShaderPass,
  RenderPass
  // UnrealBloomPass,
  // SMAAPass,
  // SSAARenderPass
} from './libs/post/EffectComposer'

// import FXAA from './libs/post/FXAA'
// import VignetteShader from './libs/post/Vignette'
// import CopyShader from './libs/post/CopyShader'
// import FilmShader from './libs/post/Film'

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'

// CSS
import './App.css'

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)
    this.OrbitControls = OrbitContructor(THREE)
    this.voronoi = new Voronoi()
    this.planeSize = 500
    this.ObjectLoader = new THREE.ObjectLoader()
    this.gltfLoader = new GLTFLoader()
    this.blockGeoData = {}
  }

  componentDidMount () {
    this.initStage()
  }

  async initStage () {
    await this.initFirebase()
    this.crystalGenerator = new Crystal(this.firebaseDB)
    this.initScene()
    this.initCamera()
    this.initRenderer()
    // this.initPost()
    this.initControls()
    this.initLights()
    this.initGeometry()
    this.addEvents()
    this.animate()
  }

  initPost () {
    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(this.renderPass)

    this.setPostSettings()
  }

  setPostSettings () {
    // this.ssaaRenderPass = new SSAARenderPass(this.scene, this.camera)
    // this.ssaaRenderPass.renderToScreen = false
    // this.composer.addPass(this.ssaaRenderPass)

    // res, strength, radius, threshold
    // this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.01, 0.75)
    // this.bloomPass.renderToScreen = true
    // this.composer.addPass(this.bloomPass)

    // this.VignettePass = new ShaderPass(VignetteShader)
    // this.VignettePass.renderToScreen = true
    // this.composer.addPass(this.VignettePass)

    // this.FilmShaderPass = new ShaderPass(FilmShader)
    // this.FilmShaderPass.renderToScreen = true
    // this.composer.addPass(this.FilmShaderPass)

    /* this.FXAAPass = new ShaderPass(FXAA)
    this.FXAAPass.uniforms.resolution.value = new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight)
    this.FXAAPass.renderToScreen = true
    this.composer.addPass(this.FXAAPass) */

    // this.ssaaRenderPass = new SSAARenderPass(this.scene, this.camera)
    // this.ssaaRenderPass.renderToScreen = true
    // this.composer.addPass(this.ssaaRenderPass)

    // this.copyPass = new ShaderPass(CopyShader)
    // this.copyPass.renderToScreen = true
    // this.composer.addPass(this.copyPass)

    /* this.SMAAPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio())
    this.SMAAPass.renderToScreen = true
    this.composer.addPass(this.SMAAPass) */
  }

  async initFirebase () {
    try {
      firebase.initializeApp(this.config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)

      await firebase.firestore().enablePersistence()
    } catch (error) {
      console.log(error)
    }

    this.firebaseDB = firebase.firestore()
    this.docRef = this.firebaseDB.collection('blocks')
    this.docRefGeo = this.firebaseDB.collection('blocks_geometry')

    this.anonymousSignin()

    // send ready event
    this.emit('ready')
  }

  /**
   * Slow down a potential DDOS attack by requiring the user to be signed in anonymously
   */
  anonymousSignin () {
    firebase.auth().signInAnonymously().catch(function (error) {
      console.log(error.code)
      console.log(error.message)
    })
  }

  async getData (hash) {
    return new Promise(async (resolve, reject) => {
      // first check firebase
      let blockRef = this.docRef.doc(hash)
      let snapshot = await blockRef.get()

      if (snapshot.exists) {
        resolve(snapshot.data())
      } else {
        window.fetch('https://blockchain.info/rawblock/' + hash + '?cors=true&apiCode=' + this.config.blockchainInfo.apiCode)
          .then((resp) => resp.json())
          .then(function (block) {
            block.tx.forEach(function (tx, index) {
              let txValue = 0
              tx.out.forEach((output, index) => {
                txValue += output.value
              })
              tx.value = txValue
            })

            /* block.tx.sort(function (a, b) {
              let transactionValueA = 0
              a.out.forEach((output, index) => {
                transactionValueA += output.value
              })

              let transactionValueB = 0
              b.out.forEach((output, index) => {
                transactionValueB += output.value
              })

              return transactionValueA - transactionValueB
            }) */

            let outputTotal = 0
            let transactions = []
            block.tx.forEach((tx) => {
              let out = []
              tx.out.forEach((output) => {
                out.push(
                  {
                    spent: output.spent ? 1 : 0
                  }
                )
              })

              if (typeof tx.value === 'undefined') {
                tx.value = 0
              }

              let txObj = {
                value: tx.value,
                out: out
              }

              outputTotal += tx.value

              transactions.push(txObj)
            })

            console.log('Saving block to cache...')

            block.outputTotal = outputTotal
            block.tx = transactions

            block.cacheTime = new Date()

            // save to firebase
            this.docRef.doc(block.hash).set(
              block, { merge: true }
            ).then(function () {
              console.log('Document successfully written!')
            }).catch(function (error) {
              console.log('Error writing document: ', error)
            })

            resolve(block)
          }.bind(this))
      }
    })
  }

  initLights () {
    let light = new THREE.AmbientLight(0xffffff)
    this.scene.add(light)
  }

  async initGeometry () {
    this.hashes = []

    async function asyncForEach (array, callback) {
      for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
      }
    }

    let storeGeometry = async function (hash, blockIndex) {
      let block = await this.getData(hash)

      // check for data in cache
      let blockRefGeo = this.docRefGeo.doc(block.hash)
      let snapshotGeo = await blockRefGeo.get()

      if (!snapshotGeo.exists) {
        console.log('Block: ' + block.hash + ' does not exist in the db, adding...')
        let pointCount = Math.max(block.n_tx, 4)

        var simplex = new SimplexNoise(block.height)

        let sites = []

        Math.seedrandom(block.height)

        for (let index = 0; index < pointCount; index++) {
          let found = false
          let x = 0
          let y = 0

          while (found === false) {
            x = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))
            y = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))

            let noiseVal = simplex.noise2D(x / 300, y / 300)

            if (((Math.random() * 5) * noiseVal) > -0.3) {
              let exists = false
              for (let existsIndex = 0; existsIndex < sites.length; existsIndex++) {
                const site = sites[existsIndex]
                if (site.x === x && site.y === y) {
                  exists = true
                  break
                }
              }
              if (!exists) {
                found = true
              }
            }
          }
          sites.push({x: x, y: y})
        }

        let diagram = this.voronoi.compute(sites, {
          xl: -this.planeSize / 2,
          xr: this.planeSize / 2,
          yt: -this.planeSize / 2,
          yb: this.planeSize / 2
        })

        // work out network health
        let feeToValueRatio = 0
        if (block.outputTotal !== 0) {
          feeToValueRatio = block.fee / block.outputTotal
        }

        let blockHealth = map(feeToValueRatio, 0, 0.0001, 20, 0)
        if (blockHealth < 0) {
          blockHealth = 0
        }

        let relaxIterations = Math.round(blockHealth)

        if (block.n_tx > 1) {
          for (let index = 0; index < relaxIterations; index++) {
            try {
              diagram = this.relaxSites(diagram)
            } catch (error) {
              console.log(error)
            }
          }
        }

        await this.crystalGenerator.save(block, diagram)
      } else {
        console.log('Block: ' + block.hash + ' already exists')
      }
    }

    let timestamp = 1231642465000

    window.fetch('https://blockchain.info/blocks/' + timestamp + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      .then((resp) => resp.json())
      .then(async function (data) {
        data.blocks.forEach(block => {
          this.hashes.push(block.hash)
        })

        // await asyncForEach(this.hashes, async (hash) => {
        //   await storeGeometry.call(this, hash)
        // })

        let blockGeoRef = this.docRefGeo.orderBy('height', 'asc').limit(500)
        let snapshot = await blockGeoRef.get()
        snapshot.forEach((doc) => {
          let blockGeoData = doc.data()
          let hash = doc.id
          let offsetJSON = JSON.parse(blockGeoData.offsets)
          let offsetsArray = Object.values(offsetJSON)

          let scalesJSON = JSON.parse(blockGeoData.scales)
          let scalesArray = Object.values(scalesJSON)

          this.blockGeoData[hash] = {
            offsets: offsetsArray,
            scales: scalesArray
          }
        })

        let blockRef = this.docRef.orderBy('height', 'asc').limit(500)
        snapshot = await blockRef.get()
        snapshot.forEach((doc) => {
          let blockData = doc.data()
          let hash = doc.id
          this.blockGeoData[hash].block = blockData
        })

        let crystal = await this.crystalGenerator.getMultiple(this.blockGeoData)
        this.scene.add(crystal)
      }.bind(this))
  }

  // Lloyds relaxation methods: http://www.raymondhill.net/voronoi/rhill-voronoi-demo5.html
  cellArea (cell) {
    let area = 0
    let halfedges = cell.halfedges
    let halfedgeIndex = halfedges.length
    let halfedge
    let startPoint
    let endPoint

    while (halfedgeIndex--) {
      halfedge = halfedges[halfedgeIndex]
      startPoint = halfedge.getStartpoint()
      endPoint = halfedge.getEndpoint()
      area += startPoint.x * endPoint.y
      area -= startPoint.y * endPoint.x
    }

    return area / 2
  }

  cellCentroid (cell) {
    let x = 0
    let y = 0
    let halfedges = cell.halfedges
    let halfedgeIndex = halfedges.length
    let halfedge
    let v
    let startPoint
    let endPoint

    while (halfedgeIndex--) {
      halfedge = halfedges[halfedgeIndex]
      startPoint = halfedge.getStartpoint()
      endPoint = halfedge.getEndpoint()
      let vector = startPoint.x * endPoint.y - endPoint.x * startPoint.y
      x += (startPoint.x + endPoint.x) * vector
      y += (startPoint.y + endPoint.y) * vector
    }

    v = this.cellArea(cell) * 6

    return {
      x: x / v,
      y: y / v
    }
  }

  relaxSites (diagram) {
    let cells = diagram.cells
    let cellIndex = cells.length
    let cell
    let site
    let sites = []
    let rn
    let dist

    let p = 1 / cellIndex * 0.1

    while (cellIndex--) {
      cell = cells[cellIndex]
      rn = Math.random()

      site = this.cellCentroid(cell)

      dist = new THREE.Vector2(site.x, site.y).distanceTo(new THREE.Vector2(cell.site.x, cell.site.y))

      if (isNaN(dist)) {
        console.log('NaN')
        continue
      }

      // don't relax too fast
      if (dist > 2) {
        site.x = (site.x + cell.site.x) / 2
        site.y = (site.y + cell.site.y) / 2
      }

      // probability of mytosis
      if (rn > (1 - p)) {
        dist /= 2
        sites.push({
          x: site.x + (site.x - cell.site.x) / dist,
          y: site.y + (site.y - cell.site.y) / dist
        })
      }

      sites.push(site)
    }

    diagram = this.voronoi.compute(sites, {
      xl: -this.planeSize / 2,
      xr: this.planeSize / 2,
      yt: -this.planeSize / 2,
      yb: this.planeSize / 2
    })

    return diagram
  }

  initSound () {
    return new Promise((resolve, reject) => {

    })
  }

  playSound () {

  }

  initControls () {
    this.controls = new this.OrbitControls(this.camera, this.renderer.domElement)
    this.setControlsSettings()
  }

  setControlsSettings () {
    this.controls.zoomSpeed = 0.5
  }

  setConfig (newConfig) {
    this.config = deepAssign(this.config, newConfig)

    this.setControlsSettings()
    this.setCameraSettings()

    if (this.FDG && this.FDG.active === true) {
      this.FDG.triggerUpdate()
    }
  }

  animate () {
    window.requestAnimationFrame(this.animate.bind(this))
    this.renderFrame()
  }

  renderFrame () {
    this.controls.update()

    this.renderer.render(this.scene, this.camera)
    // this.composer.render()
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)
    this.resize()
  }

  initScene () {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(Config.scene.bgColor, Config.scene.fogDensity)
    this.scene.rotation.x = (Math.PI / 2)
    this.scene.rotation.y = Math.PI
    this.scene.position.y += 1.0

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa-med/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.scene.background = this.cubeMap
  }

  /**
   * Set up camera with defaults
   */
  initCamera () {
    this.camera = new THREE.PerspectiveCamera(
      this.config.camera.fov,
      window.innerWidth / window.innerHeight,
      1,
      100000
    )
    window.camera = this.camera
    this.camera.position.x = this.config.camera.initPos.x
    this.camera.position.y = this.config.camera.initPos.y
    this.camera.position.z = this.config.camera.initPos.z

    this.camera.updateMatrixWorld()
    this.setCameraSettings()
  }

  setCameraSettings () {
    this.camera.fov = this.config.camera.fov
    this.camera.updateMatrixWorld()
  }

  /**
   * Set up renderer
   */
  initRenderer () {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.config.scene.antialias,
      logarithmicDepthBuffer: true,
      canvas: document.getElementById(this.config.scene.canvasID)
      // alpha: true
    })
    this.renderer.setClearColor(0xffffff, 0)
  }

  /**
   * Window resize
   */
  resize () {
    if (this.config.scene.fullScreen) {
      this.width = window.innerWidth
      this.height = window.innerHeight
    } else {
      this.width = this.config.scene.width
      this.height = this.config.scene.height
    }

    this.config.scene.width = this.width
    this.config.scene.height = this.height

    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)

    // this.composer.setSize(this.width, this.height)
  }

  render () {
    return (
      <div className='symphony'>
        <canvas width={this.config.scene.width} height={this.config.scene.height} id={this.config.scene.canvasID} />
      </div>
    )
  }
}

export default App
