// libs
import React, { Component } from 'react'
import * as THREE from 'three'
import GLTFLoader from 'three-gltf-loader'
// import OrbitConstructor from 'three-orbit-controls'
import deepAssign from 'deep-assign'
import EventEmitter from 'eventemitter3'
import mixin from 'mixin'
import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
import 'firebase/storage'
import moment from 'moment'
import { map } from './utils/math'
import FlyControls from './libs/FlyControls'
import MapControls from './libs/MapControls'
import Audio from './libs/audio'
import Circuit from './libs/circuit'

// post
import {
  EffectComposer,
  ShaderPass,
  RenderPass,
  UnrealBloomPass,
  SMAAPass
} from './libs/post/EffectComposer'

import HueSaturation from './libs/post/HueSaturation'
import BrightnessContrast from './libs/post/BrightnessContrast'
import VignetteShader from './libs/post/Vignette'
import FilmShader from './libs/post/Film'

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'
import CrystalAO from './geometry/crystalAO/CrystalAO'
import Plane from './geometry/plane/Plane'
import Tree from './geometry/tree/Tree'
import Disk from './geometry/disk/Disk'

// CSS
import './App.css'

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)
    // this.OrbitControls = OrbitConstructor(THREE)

    this.planeSize = 500
    this.planeOffsetMultiplier = 500
    this.planeMargin = 100
    this.blockReady = false
    this.coils = 100
    this.radius = 1000000

    this.gltfLoader = new GLTFLoader()
    this.blockGeoDataArray = []
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()

    this.blockPositions = []
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.topside = null
    this.closestBlockReadyForUpdate = false
    this.shouldDrawUnderside = true
    this.firstLoop = true
    this.geoAdded = false
    this.clock = new THREE.Clock()

    this.loadedHeights = []

    this.state = {
      closestBlock: null,
      controlType: ''
    }
  }

  componentDidMount () {
    this.initStage()
  }

  getBlockPosition (blockIndex) {
    let thetaMax = this.coils * (Math.PI * 2)
    let awayStep = this.radius / thetaMax
    let chord = this.planeSize + this.planeMargin

    let xOffset
    let zOffset

    let offset = this.planeSize * this.planeOffsetMultiplier

    let theta = (this.planeSize + offset) / awayStep

    if (this.blockPositions.indexOf(blockIndex) === -1) {
      for (let index = 0; index <= blockIndex; index++) {
        let away = awayStep * theta
        if (index === blockIndex) {
          xOffset = Math.cos(theta) * away
          zOffset = Math.sin(theta) * away
          this.blockPositions[index] = {
            x: xOffset,
            z: zOffset
          }
        }
        theta += chord / away
      }
    }

    return this.blockPositions[blockIndex]
  }

  async initStage () {
    await this.initFirebase()

    this.circuit = new Circuit({FBStorageCircuitRef: this.FBStorageCircuitRef})
    this.audio = new Audio({FBStorageAudioRef: this.FBStorageAudioRef})

    this.crystalGenerator = new Crystal({
      firebaseDB: this.firebaseDB,
      planeSize: this.planeSize,
      planeOffsetMultiplier: this.planeOffsetMultiplier,
      planeMargin: this.planeMargin,
      coils: this.coils,
      radius: this.radius
    })

    this.crystalAOGenerator = new CrystalAO({
      firebaseDB: this.firebaseDB,
      planeSize: this.planeSize,
      planeOffsetMultiplier: this.planeOffsetMultiplier,
      planeMargin: this.planeMargin,
      coils: this.coils,
      radius: this.radius
    })

    this.planeGenerator = new Plane({
      planeSize: this.planeSize,
      planeOffsetMultiplier: this.planeOffsetMultiplier,
      planeMargin: this.planeMargin,
      coils: this.coils,
      radius: this.radius
    })

    this.treeGenerator = new Tree({
      planeSize: this.planeSize,
      planeOffsetMultiplier: this.planeOffsetMultiplier,
      planeMargin: this.planeMargin,
      coils: this.coils,
      radius: this.radius
    })

    this.diskGenerator = new Disk({
      planeOffsetMultiplier: this.planeOffsetMultiplier,
      planeMargin: this.planeMargin,
      coils: this.coils,
      radius: this.radius
    })

    this.initScene()
    this.initCamera()
    this.initRenderer()
    this.initPost()
    this.initControls()
    this.initLights()
    await this.initPositions()
    this.initEnvironment()
    this.initGeometry()
    this.addEvents()
    this.animate()
  }

  setTimestampToLoad () {
    let timestampToLoad = moment().valueOf() // default to today's date

    if (typeof URLSearchParams !== 'undefined') {
      // get date from URL
      let urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('date')) {
        timestampToLoad = moment(urlParams.get('date')).valueOf()
      }
    }
    return timestampToLoad
  }

  initPost () {
    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(this.renderPass)

    this.setPostSettings()
  }

  setPostSettings () {
    this.HueSaturationPass = new ShaderPass(HueSaturation)
    this.composer.addPass(this.HueSaturationPass)

    this.BrightnessContrastPass = new ShaderPass(BrightnessContrast)
    this.composer.addPass(this.BrightnessContrastPass)

    // res, strength, radius, threshold
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.95)

    this.composer.addPass(this.bloomPass)

    this.VignettePass = new ShaderPass(VignetteShader)

    this.composer.addPass(this.VignettePass)

    this.FilmShaderPass = new ShaderPass(FilmShader)
    this.composer.addPass(this.FilmShaderPass)

    this.SMAAPass = new SMAAPass(window.innerWidth, window.innerHeight)
    this.SMAAPass.renderToScreen = true
    this.composer.addPass(this.SMAAPass)
  }

  async initFirebase () {
    try {
      firebase.initializeApp(this.config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)
      this.FBStorage = firebase.storage()
      this.FBStorageRef = this.FBStorage.ref()

      this.FBStorageCircuitRef = this.FBStorageRef.child('bitcoin_circuits')
      this.FBStorageAudioRef = this.FBStorageRef.child('bitcoin_block_audio')

      // await firebase.firestore().enablePersistence()
    } catch (error) {
      console.log(error)
    }

    this.firebaseDB = firebase.firestore()
    this.docRef = this.firebaseDB.collection('bitcoin_blocks')
    this.docRefGeo = this.firebaseDB.collection('bitcoin_blocks_geometry')

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

  /**
   * Get data about a block
   *
   * Handles caching of data to firebase
   *
   * @param {string} hash
   */
  async getBlockData (hash) {
    return new Promise(async (resolve, reject) => {
      // should block data be saved to firebase?
      let shouldCache = false

      // first check firebase
      let blockRef = this.docRef.doc(hash)
      let snapshot = await blockRef.get()

      let blockData

      if (!snapshot.exists) {
        shouldCache = true
      } else {
        blockData = snapshot.data()
        // check if block was cached more than a day ago
        if (moment().valueOf() - blockData.cacheTime.toMillis() > 86400000) {
          console.log('Block: ' + hash + ' is out of date, re-adding')
          shouldCache = true
        }
      }

      // shouldCache = true

      if (!shouldCache) {
        console.log('Block data for: ' + hash + ' returned from cache')
        resolve(blockData)
      } else {
        resolve(
          await this.cacheBlockData(hash)
        )
      }
    })
  }

  async cacheBlockData (hash) {
    return new Promise((resolve, reject) => {
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

          // this.sortTXData(block.tx)

          let outputTotal = 0
          let transactions = []

          const txCount = block.tx.length

          block.txTimes = []

          for (let i = 0; i < block.tx.length; i++) {
            const tx = block.tx[i]

            let out = []
            tx.out.forEach((output) => {
              out.push({
                spent: output.spent ? 1 : 0
              })
            })

            if (typeof tx.value === 'undefined') {
              tx.value = 0
            }

            transactions.push({
              hash: tx.hash,
              time: tx.time,
              value: tx.value,
              out: out
            })

            outputTotal += tx.value

            let txTime = map(i, 0, txCount, 0, 30)
            block.txTimes.push(txTime)
          }

          block.outputTotal = outputTotal
          block.tx = transactions
          block.cacheTime = new Date()

          block.healthRatio = (block.fee / block.outputTotal) * 2000 // 0 == healthy

          // save to firebase
          this.docRef.doc(block.hash).set(
            block, { merge: false }
          ).then(function () {
            console.log('Block data for: ' + block.hash + ' successfully written!')
          }).catch(function (error) {
            console.log('Error writing document: ', error)
          })

          resolve(block)
        }.bind(this))
    })
  }

  sortTXData (tx) {
    tx.sort(function (a, b) {
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
  }

  initLights () {
    // let light = new THREE.AmbientLight(0xffffff)
    // this.scene.add(light)

    this.pointLight = new THREE.PointLight(0xffa2a2, 0.5, 0, 9999999)
    this.pointLight.position.set(0, 2000, 0)
    this.scene.add(this.pointLight)

    this.planetMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa2/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.planetGeo = new THREE.SphereBufferGeometry(200000, 50, 50)
    this.planetMat = new THREE.MeshStandardMaterial({
      fog: false,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.8,
      roughness: 0.2,
      envMap: this.planetMap
    })

    this.planetMesh = new THREE.Mesh(this.planetGeo, this.planetMat)
  }

  async asyncForEach (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }

  async getGeometry (hash) {
    let blockData = await this.getBlockData(hash)

    // check for data in cache
    let blockRefGeo = this.docRefGeo.doc(blockData.hash)
    let snapshotGeo = await blockRefGeo.get()

    let blockGeoData

    if (!snapshotGeo.exists) {
      blockGeoData = await this.crystalGenerator.save(blockData)
    } else {
      let rawData = snapshotGeo.data()

      let offsetJSON = JSON.parse(rawData.offsets)
      let offsetsArray = Object.values(offsetJSON)

      let scalesJSON = JSON.parse(rawData.scales)
      let scalesArray = Object.values(scalesJSON)

      blockGeoData = {
        offsets: offsetsArray,
        scales: scalesArray
      }
    }

    const height = parseInt(blockData.height, 10)

    blockData.pos = this.blockPositions[height]

    this.blockGeoDataArray[height] = blockGeoData
    this.blockGeoDataArray[height].blockData = blockData

    return this.blockGeoDataArray[height]
  }

  async initEnvironment () {
    // this.scene.add(this.planetMesh)

    this.disk = await this.diskGenerator.init()
    this.disk.renderOrder = 3
    this.scene.add(this.disk)
  }

  async getMaxHeight () {
    // BTC.getLatestBlock({this.config.blockchainInfo.apiCode}).then(({ hash }) => btc.getBlock(hash, {this.config.blockchainInfo.apiCode}))
  }

  async initPositions () {
    let timestampToLoad = moment().valueOf() // default to today's date
    let latestBlockData = await window.fetch('https://blockchain.info/blocks/' + timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    let latestBlockDataJSON = await latestBlockData.json()
    this.maxHeight = latestBlockDataJSON.blocks[0].height
    console.log(this.maxHeight)

    let thetaMax = this.coils * (Math.PI * 2)
    let awayStep = (this.radius / thetaMax)
    let chord = this.planeSize + this.planeMargin

    let xOffset
    let zOffset

    let offset = this.planeSize * this.planeOffsetMultiplier

    let theta = (this.planeSize + offset) / awayStep

    console.time('posLoop')
    for (let addCount = 0; addCount <= this.maxHeight; addCount++) {
      let away = awayStep * theta
      xOffset = Math.cos(theta) * away
      zOffset = Math.sin(theta) * away
      this.blockPositions[addCount] = {
        x: xOffset,
        z: zOffset
      }

      theta += chord / away

      let blockGeoData = {}
      blockGeoData.blockData = {
        pos: {
          x: this.blockPositions[addCount].x,
          z: this.blockPositions[addCount].z
        }
      }
    }
    console.timeEnd('posLoop')
  }

  async initGeometry () {
    window.fetch('https://blockchain.info/blocks/' + this.timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      .then((resp) => resp.json())
      .then(async function (data) {
        data.blocks.forEach(block => {
          this.hashes.push(block.hash)
        })

        let addCount = 0

        await this.asyncForEach(this.hashes, async (hash) => {
          if (addCount < 1) {
            let blockGeoData = await this.getGeometry(hash, addCount)

            // let crystalAO = await this.crystalAOGenerator.getMultiple(this.blockGeoDataArray)
            // crystalAO.renderOrder = 2
            // crystalAO.translateY(0.1)
            // this.scene.add(crystalAO)

            if (!this.geoAdded) {
              this.crystal = await this.crystalGenerator.init(blockGeoData)
              this.crystal.renderOrder = 0
              this.scene.add(this.crystal)

              this.trees = await this.treeGenerator.init(blockGeoData)
              this.trees.renderOrder = 0
              this.scene.add(this.trees)

              this.plane = await this.planeGenerator.init(blockGeoData)
              this.plane.renderOrder = 0
              this.scene.add(this.plane)

              let planeX = this.plane.geometry.attributes.planeOffset.array[0]
              let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

              this.camera.position.x = planeX
              this.camera.position.z = planeZ

              this.controls.target = new THREE.Vector3(planeX, 0, planeZ)

              this.geoAdded = true
              this.blockReady = true

              this.closestBlockReadyForUpdate = true

              // this.addClosestBlockDetail()
            } else {
              this.planeGenerator.updateGeometry(blockGeoData, addCount)
              this.treeGenerator.updateGeometry(blockGeoData, addCount)
              this.crystalGenerator.updateGeometry(blockGeoData)
            }
          }
          addCount++
        })
      }.bind(this))
  }

  initSound () {
    return new Promise((resolve, reject) => {

    })
  }

  playSound () {

  }

  initControls () {
    this.toggleMapControls()
  }

  toggleMapControls () {
    this.switchControls('map')

    if (this.closestBlock) {
      this.controls.target = new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
      this.camera.position.x = this.closestBlock.blockData.pos.x
      this.camera.position.y = 2000
      this.camera.position.z = this.closestBlock.blockData.pos.z
    }
  }

  toggleFlyControls () {
    this.switchControls('fly')
  }

  switchControls (type) {
    if (this.controls) {
      this.controls.dispose()
      this.controls = null
    }

    switch (type) {
      case 'map':
        this.controls = new MapControls(this.camera)
        this.controls.domElement = this.renderer.domElement
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.25
        this.controls.screenSpacePanning = false
        this.controls.minDistance = 100
        this.controls.maxDistance = 1000000
        this.controls.maxPolarAngle = Math.PI / 2
        this.controls.rotateSpeed = 0.1
        this.controls.panSpeed = 0.5
        break

      case 'fly':
        this.controls = new FlyControls(this.camera)
        this.controls.movementSpeed = 100
        this.controls.domElement = this.renderer.domElement
        this.controls.rollSpeed = Math.PI / 24
        this.controls.autoForward = false
        this.controls.dragToLook = false
        break

      default:
        break
    }

    this.setState({controlType: type})
  }

  setConfig (newConfig) {
    this.config = deepAssign(this.config, newConfig)

    this.setControlsSettings()
    this.setCameraSettings()
  }

  animate () {
    window.requestAnimationFrame(this.animate.bind(this))
    this.renderFrame()
  }

  getClosestBlock () {
    if (this.camera.position.y >= 2000) {
      this.setState({closestBlock: null})
      this.closestBlockReadyForUpdate = true
      return
    }

    this.prevClosestBlock = this.closestBlock
    if (this.blockGeoDataArray.length > 0) {
      let closestDist = Number.MAX_SAFE_INTEGER

      for (const height in this.blockGeoDataArray) {
        if (this.blockGeoDataArray.hasOwnProperty(height)) {
          const blockGeoData = this.blockGeoDataArray[height]

          // this.blockGeoDataArray.forEach((blockGeoData, height) => {
          const blockPos = new THREE.Vector3(blockGeoData.blockData.pos.x, 0, blockGeoData.blockData.pos.z)
          const blockDist = blockPos.distanceToSquared(this.camera.position)

          this.blockGeoDataArray[height].dist = blockDist

          // console.log(blockDist)

          if (typeof this.audio.gainNodes[height] !== 'undefined') {
          // this.audio.audioSources[height].stop()
          // delete this.audio.audioSources[height]
          // delete this.audio.buffers[height]
          // delete this.audio.gainNodes[height]
          // clearTimeout(this.audio.loops[height])

            let vol = map((blockDist * 0.001), 0, 300, 1.0, 0.0)
            if (vol < 0 || !isFinite(vol)) {
              vol = 0
            }
            this.audio.gainNodes[height].gain.value = vol
          }

          if (blockDist < closestDist) {
            closestDist = blockDist
            this.closestBlock = blockGeoData
          }
        }
      }

      if (this.prevClosestBlock) {
        if (this.prevClosestBlock.blockData.hash !== this.closestBlock.blockData.hash) {
          this.closestBlockReadyForUpdate = true
        }
        if (closestDist < 300000 && this.closestBlockReadyForUpdate) {
          this.closestBlockReadyForUpdate = false
          this.emit('blockChanged')
        }
      }
    }
  }

  async loadNearestBlocks () {
    if (this.camera.position.y < 15000) {
      let loadNew = false

      if (typeof this.lastLoadPos === 'undefined') {
        this.lastLoadPos = {
          x: this.camera.position.x,
          z: this.camera.position.z
        }
        loadNew = true
      }

      if (
        Math.abs(this.camera.position.x - this.lastLoadPos.x) > 1000 ||
        Math.abs(this.camera.position.z - this.lastLoadPos.z) > 1000
      ) {
        loadNew = true
      }

      // loadNew = false

      if (loadNew) {
        this.lastLoadPos = {
          x: this.camera.position.x,
          z: this.camera.position.z
        }

        let closestDist = Number.MAX_SAFE_INTEGER
        let closestHeight = 0

        let camVec = new THREE.Vector2(this.camera.position.x, this.camera.position.z)

        console.time('closest')
        this.blockPositions.forEach((pos, height) => {
          let posVec = new THREE.Vector2(pos.x, pos.z)
          let dist = posVec.distanceToSquared(camVec)
          if (dist < closestDist) {
            closestDist = dist
            closestHeight = height
          }
        })
        console.timeEnd('closest')

        if (this.loadedHeights.indexOf(closestHeight) !== -1) {
          return
        }

        this.loadedHeights.push(closestHeight)

        console.log({closestHeight})

        let closestBlocksData = []
        let closestBlocksGeoData = []

        let blockData = this.docRef
          .where('height', '>=', closestHeight - 10)
          .where('height', '<=', closestHeight + 10)
          .orderBy('height', 'asc')
          // .limit(100)

        let querySnapshot = await blockData.get()

        querySnapshot.forEach(snapshot => {
          let data = snapshot.data()
          if (typeof this.blockGeoDataArray[data.height] === 'undefined') {
            closestBlocksData.push(data)
          }
        })

        let blockGeoData = this.docRefGeo
          .where('height', '>=', closestHeight - 10)
          .where('height', '<=', closestHeight + 10)
          .orderBy('height', 'asc')
          // .limit(100)

        let geoSnapshot = await blockGeoData.get()

        geoSnapshot.forEach(snapshot => {
          let data = snapshot.data()

          if (typeof this.blockGeoDataArray[data.height] === 'undefined') {
            let offsetJSON = JSON.parse(data.offsets)
            let offsetsArray = Object.values(offsetJSON)

            let scalesJSON = JSON.parse(data.scales)
            let scalesArray = Object.values(scalesJSON)

            let blockData = data

            blockData.offsets = offsetsArray
            blockData.scales = scalesArray

            closestBlocksGeoData.push(data)
          }
        })

        closestBlocksGeoData.forEach(async (blockGeoData, i) => {
          if (typeof this.blockGeoDataArray[blockGeoData.height] === 'undefined') {
            if (typeof closestBlocksData[i] !== 'undefined') {
              blockGeoData.blockData = closestBlocksData[i]

              blockGeoData.blockData.pos = this.blockPositions[blockGeoData.height]

              blockGeoData.blockData.healthRatio = (blockGeoData.blockData.fee / blockGeoData.blockData.outputTotal) * 2000 // 0 == healthy

              this.blockGeoDataArray[blockGeoData.height] = blockGeoData

              this.planeGenerator.updateGeometry(blockGeoData)
              this.treeGenerator.updateGeometry(blockGeoData)
              this.crystalGenerator.updateGeometry(blockGeoData)
            }
          }
        })

        this.heightsToLoad = []
        if (typeof this.blockGeoDataArray[closestHeight] === 'undefined') {
          this.heightsToLoad.push(closestHeight)
        }

        for (let height = 1; height < 10; height++) {
          let next = closestHeight + height
          let prev = closestHeight - height

          if (typeof this.blockGeoDataArray[next] === 'undefined') {
            if (next <= this.maxHeight && next >= 0) {
              this.heightsToLoad.push(next)
            }
          }

          if (typeof this.blockGeoDataArray[prev] === 'undefined') {
            if (prev <= this.maxHeight && prev >= 0) {
              this.heightsToLoad.push(prev)
            }
          }
        }

        console.log(this.heightsToLoad)

        this.heightsToLoad.forEach(async (height) => {
          let blockData = await window.fetch('https://cors-anywhere.herokuapp.com/https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
          // let blockData = await window.fetch('https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
          let blockDataJSON = await blockData.json()

          // let blockDataSimple = await window.fetch('https://api.blockcypher.com/v1/btc/main/blocks/' + height + '?txstart=1&limit=1&token=92848af8183b455b8950e8c32753728c')
          // let blockDataSimpleJSON = await blockDataSimple.json()

          let blockGeoData = await this.getGeometry(blockDataJSON.blocks[0].hash)
          this.planeGenerator.updateGeometry(blockGeoData)
          this.treeGenerator.updateGeometry(blockGeoData)
          this.crystalGenerator.updateGeometry(blockGeoData)
        })
      }
    }
  }

  renderFrame () {
    let delta = this.clock.getDelta()

    this.controls.update(delta)

    if (this.geoAdded) {
      this.loadNearestBlocks()
    }
    this.getClosestBlock()

    // if (this.plane) {
    //   if (this.camera.position.y < 0) {
    //     this.plane.renderOrder = 1
    //   } else {
    //     this.plane.renderOrder = 2
    //   }
    // }

    // check if camera is inside occluder
    // if (this.occluder) {
    //   // this.occluder.updateMatrixWorld(true)
    //   let boxMatrixInverse = new THREE.Matrix4().getInverse(this.occluder.matrixWorld)
    //   let inverseBox = this.occluder.clone()
    //   // this.camera.updateMatrixWorld()
    //   // this.camera.updateMatrix()
    //   let inversePoint = this.camera.position.clone()
    //   inverseBox.applyMatrix(boxMatrixInverse)
    //   inversePoint.applyMatrix4(boxMatrixInverse)
    //   let boundingBox = new THREE.Box3().setFromObject(inverseBox)

    //   boundingBox.expandByScalar(0.015)
    //   boundingBox.translate(new THREE.Vector3(0, 0, 0.015))

    //   // if (this.crystal) {
    //   //   if (boundingBox.containsPoint(inversePoint)) {
    //   //     this.crystal.visible = false
    //   //   } else {
    //   //     this.crystal.visible = true
    //   //   }
    //   // }
    // }

    if (this.blockReady) {
      this.diskGenerator.update({time: window.performance.now(), camPos: this.camera.position})
      this.crystalGenerator.update(window.performance.now(), this.firstLoop)
      // this.crystalAOGenerator.update(window.performance.now(), this.firstLoop)
    }

    this.FilmShaderPass.uniforms.time.value = window.performance.now() * 0.00001

    // this.renderer.render(this.scene, this.camera)
    this.composer.render()
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)

    this.on('blockChanged', () => {
      this.addClosestBlockDetail()
    })

    this.resize()

    this.audio.on('loopend', (blockData) => {
      this.crystalGenerator.updateBlockStartTimes(blockData)
    })

    document.addEventListener('keydown', (event) => {
      if (this.state.controlType === 'fly') {
        if (event.shiftKey) {
          if (this.controls.movementSpeed < 1000) {
            this.controls.movementSpeed += 10
          }
        }
      }
    })

    document.addEventListener('keyup', (event) => {
      if (this.state.controlType === 'fly') {
        if (!event.shiftKey) {
          this.controls.movementSpeed = 100
        }
      }
    })
  }

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

    this.setState({
      closestBlock: this.closestBlock
    })

    for (const height in this.audio.audioSources) {
      if (this.audio.audioSources.hasOwnProperty(height)) {
        /*

        src.stop()
        delete this.audio.audioSources[height]
        delete this.audio.buffers[height]
        delete this.audio.gainNodes[height]

        */

        clearTimeout(this.audio.loops[height])
      }
    }

    if (typeof this.audio.buffers[this.closestBlock.blockData.height] === 'undefined') {
      this.audio.generate(this.closestBlock.blockData)

      this.crystalGenerator.updateBlockStartTimes(this.closestBlock.blockData)
    }

    this.blockReady = true

    if (this.shouldDrawUnderside) {
      const nTX = Object.keys(this.closestBlock.blockData.tx).length
      let undersideTexture = await this.circuit.draw(nTX, this.closestBlock)

      let height = this.crystalGenerator.txIndexOffsets[this.closestBlock.blockData.height]

      let quat = new THREE.Quaternion(
        this.crystal.geometry.attributes.quaternion.array[height * 4 + 0],
        this.crystal.geometry.attributes.quaternion.array[height * 4 + 1],
        this.crystal.geometry.attributes.quaternion.array[height * 4 + 2],
        this.crystal.geometry.attributes.quaternion.array[height * 4 + 3]
      )

      undersideTexture.minFilter = THREE.LinearMipMapLinearFilter
      let undersideGeometry = new THREE.PlaneBufferGeometry(this.planeSize + 10, this.planeSize + 10, 1)
      let undersideMaterial = new THREE.MeshBasicMaterial({
      // side: THREE.DoubleSide,
        transparent: true,
        map: undersideTexture
      })

      if (this.underside) {
        this.scene.remove(this.underside)
      }

      this.underside = new THREE.Mesh(undersideGeometry, undersideMaterial)
      this.underside.frustumCulled = false

      this.underside.renderOrder = 2

      this.underside.translateX(this.closestBlock.blockData.pos.x)
      this.underside.translateZ(this.closestBlock.blockData.pos.z)
      this.underside.applyQuaternion(quat)
      this.underside.rotateX(Math.PI / 2)
      this.underside.scale.set(1.0, -1.0, 1.0)

      this.underside.updateMatrix()

      this.scene.add(this.underside)

      let topsideMaterial = new THREE.MeshStandardMaterial({
        side: THREE.BackSide,
        transparent: true,
        map: undersideTexture,
        bumpMap: undersideTexture
      })

      if (this.topside) {
        this.scene.remove(this.topside)
      }

      this.topside = this.underside.clone()
      this.topside.material = topsideMaterial
      // this.topside.renderOrder = 1

      this.topside.translateZ(-0.1)
      this.underside.translateZ(4.2)

      this.scene.add(this.topside)
    }

    // create new array not including closest block
    this.prevClosestIndex = this.closestIndex
    this.closestIndex = 0

    let index = 0
    for (const height in this.blockGeoDataArray) {
      if (this.blockGeoDataArray.hasOwnProperty(height)) {
        const blockGeoData = this.blockGeoDataArray[height]
        if (blockGeoData.blockData.hash === this.closestBlock.blockData.hash) {
          this.closestIndex = index
        }
        if (index === this.prevClosestIndex) {
          this.prevClosestBlock = blockGeoData
        }
        index++
      }
    }

    /* this.treeGenerator.removeClosest(this.prevClosestBlock, this.closestIndex, this.prevClosestIndex)

    let newTree = await this.treeGenerator.get(this.closestBlock.blockData)
    this.scene.add(newTree)
    this.scene.remove(this.tree)
    this.tree = newTree
    this.tree.renderOrder = 0 */
  }

  initScene () {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(Config.scene.bgColor, Config.scene.fogDensity)

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/saturn/')
      .load([
        '_RT.png', // right
        '_LF.png', // left
        '_UP.png', // top
        '_DN.png', // bottom
        '_FT.png', // front
        '_BK.png' // back
      ])

    // this.scene.background = new THREE.Color(Config.scene.bgColor)
    this.scene.background = this.cubeMap
  }

  /**
   * Set up camera with defaults
   */
  initCamera () {
    this.camera = new THREE.PerspectiveCamera(
      this.config.camera.fov,
      window.innerWidth / window.innerHeight,
      1.0,
      1000000000
      // 10000
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
      // antialias: this.config.scene.antialias,
      antialias: false,
      logarithmicDepthBuffer: true,
      canvas: document.getElementById(this.config.scene.canvasID)
      // alpha: true
    })
    // this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1.5
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

    this.composer.setSize(this.width, this.height)
  }

  UICockpitButton () {
    if (this.state.controlType === 'fly') {
      return (
        <button onClick={this.toggleMapControls.bind(this)} className='toggle-cockpit-controls'>Leave Cockpit Mode</button>
      )
    } else {
      return (
        <button onClick={this.toggleFlyControls.bind(this)} className='toggle-cockpit-controls'>Enter Cockpit Mode</button>
      )
    }
  }

  UIBlockDetails () {
    if (this.state.closestBlock) {
      const health = this.state.closestBlock.blockData.healthRatio > 1.0 ? 1.0 : this.state.closestBlock.blockData.healthRatio
      const healthInv = (1.0 - health)

      return (
        <div>
          <div className='cockpit-border' />
          {this.UICockpitButton()}
          <div className='block-details'>
            <h2>Block {this.state.closestBlock.blockData.hash}</h2>
            <div><h3>Health</h3>
              <div className='health-bar-container' title={healthInv}>
                <div
                  className='health-bar'
                  style={{
                    width: 100 * healthInv,
                    background: 'rgba(' + 255 * health + ', ' + 255 * healthInv + ', 0.0, 1.0)'
                  }}
                />
              </div>
            </div>
            <ul>
              <li><h3>Date</h3> <strong>{ moment.unix(this.state.closestBlock.blockData.time).format('MMMM Do YYYY, h:mm:ss a') }</strong></li>
              <li><h3>Bits</h3> <strong>{ this.state.closestBlock.blockData.bits }</strong></li>
              <li><h3>Size</h3> <strong>{ this.state.closestBlock.blockData.size / 1000 } KB</strong></li>
              <li><h3>Transaction Fees</h3> <strong>{ this.state.closestBlock.blockData.fee / 100000000 }</strong></li>
            </ul>
            <ul>
              <li><h3>Height</h3> <strong>{ this.state.closestBlock.blockData.height }</strong></li>
              <li><h3>Merkle Root</h3> <strong>{ this.state.closestBlock.blockData.mrkl_root.substring(0, 10) }</strong></li>
              <li><h3>No. of Transactions</h3> <strong>{ this.state.closestBlock.blockData.n_tx }</strong></li>
              <li><h3>Output Total</h3> <strong>{ this.state.closestBlock.blockData.outputTotal / 100000000 } BTC</strong></li>
            </ul>
          </div>
        </div>
      )
    }
  }

  UI () {
    return (
      <div className='symphony-ui'>

        {this.UIBlockDetails()}
      </div>
    )
  }

  render () {
    return (
      <div className='symphony'>
        <canvas id={this.config.scene.canvasID} />
        {this.UI()}
      </div>
    )
  }
}

export default App
