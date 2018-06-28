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
    this.initPost()
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

            // save to firebase
            this.docRef.doc(block.hash).set(
              block
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
    this.hashes = [

      '00000000839a8e6886ab5951d76f411475428afc90947ee320161bbf18eb6048',
      '000000006a625f06636b8bb6ac7b960a8d03705d1ace08b1a19da3fdcc99ddbd',
      '0000000082b5015589a3fdf2d4baff403e6f0be035a5d9742c1cae6295464449',
      '000000004ebadb55ee9096c9a2f8880e09da59c0d68b1c228da88e48844a1485',
      '000000009b7262315dbf071787ad3656097b892abffd1f95a1a022f896f533fc',
      '000000003031a0e73735690c5a1ff2a4be82553b2a12b776fbd3a215dc8f778d',
      '0000000071966c2b1d065fd446b1e485b2c9d9594acd2007ccbd5441cfc89444',
      '00000000408c48f847aa786c2268fc3e6ec2af68e8468a34a28c61b7f1de0dc6',
      '000000008d9dc510f23c2657fc4f67bea30078cc05a90eb89e84cc475c080805',
      '000000002c05cc2e78923c34df87fd108b22221ac6076c18f3ade378a4d915e9',
      '0000000097be56d606cdd9c54b04d4747e957d3608abe69198c661f2add73073',
      '0000000027c2488e2510d1acf4369787784fa20ee084c258b58d9fbd43802b5e',
      '000000005c51de2031a895adc145ee2242e919a01c6d61fb222a54a54b4d3089',
      '0000000080f17a0c5a67f663a9bc9969eb37e81666d9321125f0e293656f8a37',
      '00000000b3322c8c3ef7d2cf6da009a776e6a99ee65ec5a32f3f345712238473',
      '00000000174a25bb399b009cc8deff1c4b3ea84df7e93affaaf60dc3416cc4f5',
      '0000000000000d31efa5db0081ac3ffae45e30934a81354b0721943f8f3b369b',
      '000000000000201353cb8902bd7c2492ffdd25bbd5387479d2a13c366890d165',
      '0000000000000b5cffbafef531267f244e5a703a41510f9dbc0b345218c3e73c',
      '000000000000105ff0e6f798665f0c470cd26fb1df93772c605b932943f13ffd',
      '0000000000000a851346533ddda860ae8f336142d84fa08438ab1c06f1a6dce1',
      '0000000000001c84d63133baa8d202706280b32a22c807e180df00c508651dac',
      '0000000000000000003af838cd7370571181ffe96684225c7317be886d4c73c5',
      '0000000000000000003ee585e47c16cf97c89e25cdb01fe68a1946cb2c228b12',
      '0000000000000000001172a9980d508a917ed26978f63584d47138ef9f52ca5f',
      '0000000000000000000a26674ff8ef8f91626507f1088650c26f80b058deda08',
      '0000000000000000003345e97f34769c61e9135ec3b183465626043ea1b82be0',
      '0000000000000000002fa1c02e93923f9ca3308372191778a2ef3f45656c94e1',
      '00000000000000000026180d943be62ffc994b06e21d75ae3ec794552a6efa35',
      '00000000000000000020ac808f8f9ff9c1e2fe5b8c2b5877fd772dbe5d18d51c',
      '00000000000000000010f0d353faa6f6a3ddbff399c3956fc6ee7e2fff60aac5',
      '000000000000000000082e0e21664d3f1bc7697b596a716ba79cb2c5f298a266',
      '00000000000000000002e8852490baab9e50311808d200fe223d09b2f2fa3ac4',
      '0000000000000000000b333cc01f97ecb40815d938264fdfaac13680a7cf1a39',
      '00000000000000000003f6e5885dde7bf4fcb532647c36b259cd311e71eaffc6',
      '00000000000000000004a44612c26afd6a413cd486efda2a3538442bb22e24d8',
      '00000000000000000023d255b8668f77d94816239f6cf302439dea7484973d23',
      '00000000000000000039727f6d5a3c1ab011714a7a50de7152c7bcc58bbbedd2',
      '0000000000000000000e2b8acb5b9d35308b9f2601f67de1eac730fcd8be0f58',
      '0000000000000000002c2e045201af5f80d6541ccf07d0fc3346cf2d0b03fa81',
      '00000000000000000029a217217bc3d7ce6aa8017f6b4d01e54f71dc4e920e49',
      '000000000000000000360b1f7b3970794e1fb06f47fcca72c4e5d92d8679a26d'
    ]

    async function asyncForEach (array, callback) {
      for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
      }
    }

    let generateGeometry = async function (hash, blockIndex) {
      let block = await this.getData(hash)

      // check for offsets in cache
      let blockRefGeo = this.docRefGeo.doc(block.hash)
      let snapshotGeo = await blockRefGeo.get()

      let crystal

      if (snapshotGeo.exists) {
        // get offsets/scales from cache
        let data = snapshotGeo.data()

        let offsetJSON = JSON.parse(data.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(data.scales)
        let scalesArray = Object.values(scalesJSON)

        crystal = await this.crystalGenerator.fetch(block, offsetsArray, scalesArray)
      } else {
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

        await this.crystalGenerator.create(block, diagram).then((mesh) => {
          crystal = mesh
        })
      }

      let coils = 200
      let radius = 1000000
      let center = {x: 0, y: 0}

      // value of theta corresponding to end of last coil
      let thetaMax = coils * 2 * Math.PI

      // How far to step away from center for each side.
      let awayStep = radius / thetaMax

      // distance between points to plot
      let chord = this.planeSize

      if (typeof this.theta === 'undefined') {
        let offset = this.planeSize * 1
        let chord = this.planeSize + offset
        this.theta = chord / awayStep
      }

      let rotation = 0

      let away = awayStep * this.theta

      // How far around the center.
      let around = this.theta + rotation

      // Convert 'around' and 'away' to X and Y.
      let x = center.x + Math.cos(around) * away
      let y = center.y + Math.sin(around) * away

      // to a first approximation, the points are on a circle
      // so the angle between them is chord/radius
      this.theta += chord / away

      crystal.position.z = 0
      crystal.position.x = x
      crystal.position.y = y

      crystal.lookAt(new THREE.Vector3(0, 0, 0))

      crystal.rotateY(Math.PI / 2)
      crystal.rotateZ(-(Math.PI / 2))

      if (crystal.rotation.z > 0) {
        crystal.rotateY((Math.PI))
      }

      crystal.translateZ(blockIndex * 50)
      crystal.rotateY(0.1)

      this.scene.add(crystal)
    }

    let blockIndex = 1
    await asyncForEach(this.hashes, async (hash) => {
      await generateGeometry.call(this, hash, blockIndex)
      blockIndex++
    })
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
    this.renderer.setPixelRatio(window.devicePixelRatio)
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

    this.composer.setSize(this.width, this.height)
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
