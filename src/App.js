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

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'

// CSS
import './App.css'

const noisejs = require('noisejs')

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)
    this.OrbitControls = OrbitContructor(THREE)
    this.voronoi = new Voronoi()
    this.planeSize = 500
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
            block.tx.sort(function (a, b) {
              let transactionValueA = 0
              a.out.forEach((output, index) => {
                transactionValueA += output.value
              })
              a.value = transactionValueA

              let transactionValueB = 0
              b.out.forEach((output, index) => {
                transactionValueB += output.value
              })
              b.value = transactionValueB

              return transactionValueA - transactionValueB
            })

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

              let txObj = {
                value: tx.value,
                out: out
              }

              transactions.push(txObj)
            })

            console.log('Saving block to cache...')

            block.tx = transactions

            // save to firebase
            this.docRef.doc(block.hash).set(
              block
            ).then(function () {
              console.log('Document successfully written!')
            }).catch(function (error) {
              console.error('Error writing document: ', error)
            })

            resolve(block)
          }.bind(this))
      }
    })
  }

  initLights () {
    let light = new THREE.AmbientLight(0xffffff)
    this.scene.add(light)

    let pointLight = new THREE.PointLight(0xffffff, 10)
    pointLight.position.set(0, -50, -100)
    this.scene.add(pointLight)

    let pointLight2 = new THREE.PointLight(0xffffff, 10)
    pointLight2.position.set(0, 50, 100)
    this.scene.add(pointLight2)
  }

  async initGeometry () {
    this.hashes = [
      '00000000000000000018b2ebf79807d850af7fb61cfc7c33477a1061ceac9693',
      '000000000000000000a3ccaa60d0f98276b24e0b0f4c145477805e4181325140',
      '000000000000000074953313ca30236fafe09ebd7b990f69e31778cf54c33de6',
      '00000000000000000043eaeb09b0d6b25e564068a130642fab809ed91e1acfcc',
      '0000000000000587556425a377c751a40d61fe1156c2e6b16e844fdc38c252b7',
      '00000000000000000088092c77b76f59f7294ef68b361a23c8827cc6bc3fe29f'
    ]

    let block = await this.getData('00000000000000000018b2ebf79807d850af7fb61cfc7c33477a1061ceac9693')

    let pointCount = Math.max(block.n_tx, 4)

    let noise = new noisejs.Noise(777)

    var simplex = new SimplexNoise(777)

    let sites = []

    for (let index = 0; index < pointCount; index++) {
      let found = false
      let x = 0
      let y = 0

      while (found === false) {
        x = Math.floor(Math.random() * this.planeSize)
        y = Math.floor(Math.random() * this.planeSize)

        // let noiseVal = noise.perlin2(x / 100, y / 100)
        let noiseVal = simplex.noise2D(x / 300, y / 300)

        if (((Math.random() * 5) * noiseVal) > -0.3) {
        // if (noiseVal > 0.0) {
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

    this.diagram = this.voronoi.compute(sites, {
      xl: 0,
      xr: this.planeSize,
      yt: 0,
      yb: this.planeSize
    })

    this.relaxIterate()

    this.crystal = new Crystal().create(block, this.diagram, this.scene, sites)

    this.scene.add(this.crystal)
  }

  relaxIterate () {
    for (let index = 0; index < 2; index++) {
      try {
        this.relaxSites()
      } catch (error) {
        console.log(error)
      }
    }
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

  relaxSites () {
    let cells = this.diagram.cells
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

    this.diagram = this.voronoi.compute(sites, {
      xl: 0,
      xr: this.planeSize,
      yt: 0,
      yb: this.planeSize
    })
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
    // this.controls.zoomSpeed = 0.7
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
    this.scene.rotation.z = 0.3
    this.scene.rotation.y = Math.PI
    this.scene.position.y += 1.0
  }

  /**
   * Set up camera with defaults
   */
  initCamera () {
    this.camera = new THREE.PerspectiveCamera(this.config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 20000)
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
