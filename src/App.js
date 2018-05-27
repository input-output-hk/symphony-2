// libs
import React, { Component } from 'react'
import * as THREE from 'three'
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
  }

  componentDidMount () {
    this.initStage()
  }

  async initStage () {
    await this.initFirebase()
    this.initScene()
    this.initCamera()
    this.initRenderer()
    this.initControls()
    this.initLights()
    this.initGeometry()
    this.addEvents()
    this.animate()
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

      if (snapshot.exists === true) {
        console.log('Grabbing data from cache...')
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

            block.tx.sort(function (a, b) {
              let transactionValueA = 0
              a.out.forEach((output, index) => {
                transactionValueA += output.value
              })

              let transactionValueB = 0
              b.out.forEach((output, index) => {
                transactionValueB += output.value
              })

              return transactionValueA - transactionValueB
            })

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
    let light = new THREE.AmbientLight(0xcccccc)
    this.scene.add(light)

    let pointLight = new THREE.PointLight(0xffffff, 1)
    pointLight.position.set(0, -50, -100)
    this.scene.add(pointLight)

    let pointLight2 = new THREE.PointLight(0xffffff, 1)
    pointLight2.position.set(0, 50, 100)
    this.scene.add(pointLight2)
  }

  async initGeometry () {
    this.hashes = [
      '0000000000000000223fe310bdde3f52009c4aa77e27292db062bb85925ee811',
      '00000000000000000018b2ebf79807d850af7fb61cfc7c33477a1061ceac9693',
      '000000000000000000a3ccaa60d0f98276b24e0b0f4c145477805e4181325140',
      '000000000000000074953313ca30236fafe09ebd7b990f69e31778cf54c33de6',
      '00000000000000000043eaeb09b0d6b25e564068a130642fab809ed91e1acfcc',
      '0000000000000587556425a377c751a40d61fe1156c2e6b16e844fdc38c252b7',
      '00000000000000000088092c77b76f59f7294ef68b361a23c8827cc6bc3fe29f',
      '000000000000000003543ccba3b0fcc00ea298cce116764f1e3bd5f6d20a917a',
      '000000000000000024113997c7331a9d083bff486f7c564c36fe2925734510b7',
      '00000000000000002316a635e60c4b315b2ce9f7109fbbc70a5088229574325b',
      '000000000000000014393e948604bc967c739725989222a3c2d96f98a6dac313',
      '0000000000000000223fe310bdde3f52009c4aa77e27292db062bb85925ee811',
      '0000000000000000279132016eea95836db7ecc8b5a71110e8640d16a436863e',
      '000000000000000015a7a05e84b57a4773c119ce560e896b86fe7e9fafd0ac87',
      '0000000000000000279132016eea95836db7ecc8b5a71110e8640d16a436863e',
      '0000000000000000129dc2df86682d8c19bcc24e4b49e3390c363477a27e15d8',
      '000000000000000001cf3ddab04e81d07abc36fbab57f652e520d125ebd6277b',
      '0000000000000000208ffc094fdc9d647cdc73e60587336ade608c467e0effe6',
      '00000000000000002731d68233e73e21544925aad3622accf4b779deac229ec0',
      '0000000000000000039994df7b762f60818eb8a8fc5b78122a28eabdd143cdd8',
      '00000000000000000f86f2978a64f99b22fa17a75d22320686a0d500e1cc8ffa',
      '000000000000000000e2cc68fc9245186abebf43f1bf8c3a69900a8b006b4061',
      '00000000000000000cb816b0c13d2485e48c6e38da50c131e514b5bcee881208',
      '0000000000000000102c0e933321897d87132171105bb5796d267b06e0b958dd',
      '0000000000000000183e67f807eb33f4708da2714da3606ff157145d4c09a56d',
      '00000000000000001b9959619c7a556baacaf8d0a6e9a0994ba93f2dfdf30765',
      '0000000000000000088937c33778264f601537f9409256a09801bd5f4fcb4cdd',
      '00000000000000000fe49efb9fafc78f38960b6962894576025400ab80c3442b',
      '000000000000000027f912db19dc4976569022f24d27ae5f69094d154db08c9a',
      '00000000000000001119c560f70c35932bffb5ff682d59f9cbf8af42fcdda747',
      '000000000000000007311dc0dfad3525d2816772ae6fdafe3ce8bfd99860f6f0',
      '00000000000000000018b2ebf79807d850af7fb61cfc7c33477a1061ceac9693',
      '000000000000000000a3ccaa60d0f98276b24e0b0f4c145477805e4181325140',
      '000000000000000074953313ca30236fafe09ebd7b990f69e31778cf54c33de6',
      '00000000000000000043eaeb09b0d6b25e564068a130642fab809ed91e1acfcc',
      '0000000000000587556425a377c751a40d61fe1156c2e6b16e844fdc38c252b7',
      '00000000000000000088092c77b76f59f7294ef68b361a23c8827cc6bc3fe29f',
      '000000000000000003543ccba3b0fcc00ea298cce116764f1e3bd5f6d20a917a',
      '000000000000000024113997c7331a9d083bff486f7c564c36fe2925734510b7',
      '00000000000000002316a635e60c4b315b2ce9f7109fbbc70a5088229574325b',
      '000000000000000014393e948604bc967c739725989222a3c2d96f98a6dac313',
      '0000000000000000223fe310bdde3f52009c4aa77e27292db062bb85925ee811',
      '0000000000000000279132016eea95836db7ecc8b5a71110e8640d16a436863e',
      '000000000000000015a7a05e84b57a4773c119ce560e896b86fe7e9fafd0ac87',
      '0000000000000000279132016eea95836db7ecc8b5a71110e8640d16a436863e',
      '0000000000000000129dc2df86682d8c19bcc24e4b49e3390c363477a27e15d8',
      '000000000000000001cf3ddab04e81d07abc36fbab57f652e520d125ebd6277b',
      '0000000000000000208ffc094fdc9d647cdc73e60587336ade608c467e0effe6',
      '00000000000000002731d68233e73e21544925aad3622accf4b779deac229ec0',
      '0000000000000000039994df7b762f60818eb8a8fc5b78122a28eabdd143cdd8',
      '00000000000000000f86f2978a64f99b22fa17a75d22320686a0d500e1cc8ffa',
      '000000000000000000e2cc68fc9245186abebf43f1bf8c3a69900a8b006b4061',
      '00000000000000000cb816b0c13d2485e48c6e38da50c131e514b5bcee881208',
      '0000000000000000102c0e933321897d87132171105bb5796d267b06e0b958dd',
      '0000000000000000183e67f807eb33f4708da2714da3606ff157145d4c09a56d',
      '00000000000000001b9959619c7a556baacaf8d0a6e9a0994ba93f2dfdf30765',
      '0000000000000000088937c33778264f601537f9409256a09801bd5f4fcb4cdd',
      '00000000000000000fe49efb9fafc78f38960b6962894576025400ab80c3442b',
      '000000000000000027f912db19dc4976569022f24d27ae5f69094d154db08c9a',
      '00000000000000001119c560f70c35932bffb5ff682d59f9cbf8af42fcdda747',
      '000000000000000007311dc0dfad3525d2816772ae6fdafe3ce8bfd99860f6f0'
    ]

    let blocks = []
    let diagrams = []

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

      if (snapshotGeo.exists === true) {
        // get offsets/scales from cache
        console.log('get offsets/scales from cache')
        let data = snapshotGeo.data()

        let offsetJSON = JSON.parse(data.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(data.scales)
        let scalesArray = Object.values(scalesJSON)

        crystal = await new Crystal(this.firebaseDB).fetch(block, offsetsArray, scalesArray)
      } else {
      // blocks.push(block)
        let pointCount = Math.max(block.n_tx, 4)

        var simplex = new SimplexNoise(block.height)

        let sites = []

        Math.seedrandom(block.height)

        for (let index = 0; index < pointCount; index++) {
          let found = false
          let x = 0
          let y = 0

          while (found === false) {
            x = Math.floor(Math.random() * this.planeSize)
            y = Math.floor(Math.random() * this.planeSize)

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
          xl: 0,
          xr: this.planeSize,
          yt: 0,
          yb: this.planeSize
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

        diagrams.push(diagram)

        crystal = await new Crystal(this.firebaseDB).create(block, diagram)
      }

      crystal.rotation.z = (2 * Math.PI) / this.hashes.length * blockIndex
      crystal.translateY(4800)
      crystal.rotateZ(-0.09)

      this.scene.add(crystal)
    }

    let blockIndex = 0
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

      dist = new THREE.Vector2(site).distanceTo(new THREE.Vector2(cell.site))

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
      xl: 0,
      xr: this.planeSize,
      yt: 0,
      yb: this.planeSize
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
    /* this.controls.minDistance = 110
    this.controls.maxDistance = 150
    this.controls.enablePan = false
    this.controls.autoRotate = this.config.scene.autoRotate
    this.controls.autoRotateSpeed = this.config.scene.autoRotateSpeed */
    this.controls.zoomSpeed = 2.0
    this.controls.rotateSpeed = 0.07
    this.controls.enableDamping = true
    this.controls.enableZoom = true
    this.controls.dampingFactor = 0.04
    // this.controls.minPolarAngle = 1.0
    // this.controls.maxPolarAngle = (Math.PI * 0.6)
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
    requestAnimationFrame(this.animate.bind(this))
    this.renderFrame()
  }

  renderFrame () {
    this.controls.update()

    // this.box.geometry.attributes.fftData.array = fftValues
    // this.box.geometry.attributes.fftData.needsUpdate = true

    this.renderer.render(this.scene, this.camera)
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)
    this.resize()
  }

  initScene () {
    this.scene = new THREE.Scene()
    this.scene.rotation.x = (Math.PI / 2)
    this.scene.rotation.y = Math.PI
    this.scene.position.y += 1.0
  }

  /**
   * Set up camera with defaults
   */
  initCamera () {
    this.camera = new THREE.PerspectiveCamera(
      this.config.camera.fov,
      window.innerWidth / window.innerHeight,
      1.0,
      10000000
    )
    // this.camera.logarithmicDepthBuffer = true
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
      canvas: document.getElementById(this.config.scene.canvasID),
      alpha: true
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
