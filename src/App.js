// libs
import React, { Component } from 'react'
import * as THREE from 'three'
import GLTFLoader from 'three-gltf-loader'
import OrbitConstructor from 'three-orbit-controls'
import deepAssign from 'deep-assign'
import EventEmitter from 'eventemitter3'
import mixin from 'mixin'
import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
import 'firebase/storage'
import moment from 'moment'
import { map } from './utils/math'

// post
import {
  EffectComposer,
  ShaderPass,
  RenderPass,
  UnrealBloomPass,
  SMAAPass
  // SSAARenderPass
} from './libs/post/EffectComposer'

import HueSaturation from './libs/post/HueSaturation'
import BrightnessContrast from './libs/post/BrightnessContrast'
// import FXAA from './libs/post/FXAA'
import VignetteShader from './libs/post/Vignette'
// import CopyShader from './libs/post/CopyShader'
import FilmShader from './libs/post/Film'

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'
import CrystalAO from './geometry/crystalAO/CrystalAO'
import Plane from './geometry/plane/Plane'
import Tree from './geometry/tree/Tree'
import Disk from './geometry/disk/Disk'

// Audio
import Audio from './libs/audio'

// Circuit
import Circuit from './libs/circuit'

// CSS
import './App.css'

import FlyControls from './libs/FlyControls'

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)
    this.OrbitControls = OrbitConstructor(THREE)

    this.planeSize = 500
    this.planeOffsetMultiplier = 500
    this.planeMargin = 100
    this.blockReady = false
    this.blockReadyTime = 0
    this.coils = 100
    this.radius = 1000000
    this.ObjectLoader = new THREE.ObjectLoader()

    this.gltfLoader = new GLTFLoader()
    this.blockGeoDataArray = []
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()
    this.merkleYOffset = 0

    this.blockPositions = []
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.topside = null
    this.closestBlockReadyForUpdate = false
    this.sceneReady = false
    this.shouldDrawUnderside = true
    this.firstLoop = true
    this.geoAdded = false
    this.clock = new THREE.Clock()
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
    // this.initPost()
    this.initControls()
    this.initLights()
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
    // this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.01, 0.75)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.97)
    // this.bloomPass.renderToScreen = true
    this.composer.addPass(this.bloomPass)

    this.VignettePass = new ShaderPass(VignetteShader)
    // this.VignettePass.renderToScreen = true
    this.composer.addPass(this.VignettePass)

    this.FilmShaderPass = new ShaderPass(FilmShader)
    // this.FilmShaderPass.renderToScreen = true
    this.composer.addPass(this.FilmShaderPass)

    // this.FXAAPass = new ShaderPass(FXAA)
    // this.FXAAPass.uniforms.resolution.value = new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight)
    // this.FXAAPass.renderToScreen = true
    // this.composer.addPass(this.FXAAPass)

    // this.copyPass = new ShaderPass(CopyShader)
    // this.copyPass.renderToScreen = true
    // this.composer.addPass(this.copyPass)

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

          // block.pos = this.getBlockPosition(block.height)
          block.pos = this.blockPositions[block.height]

          // save to firebase
          this.docRef.doc(block.hash).set(
            block, { merge: true }
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

    // this.pointLight = new THREE.PointLight(0xffa2a2, 0.5, 0, 9999999)
    // this.pointLight = new THREE.PointLight(0xffffff, 0.5, 0, 9999999)
    // this.pointLight.position.set(0, 2000, 0)
    // this.scene.add(this.pointLight)

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

    this.planetGeo = new THREE.SphereBufferGeometry(195000, 50, 50)
    this.planetMat = new THREE.MeshStandardMaterial({
      // flatShading: true,
      color: 0xffffff,
      // color: 0x87ffd9,
      emissive: 0x000000,
      metalness: 0.8,
      roughness: 0.2,
      // side: THREE.DoubleSide,
      envMap: this.planetMap
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      /* roughnessMap: this.roughnessMap,
      metalnessMap: this.roughnessMap, */
      /* normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.03, 0.03) */
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

    const height = parseInt(blockData.height)

    this.blockGeoDataArray[height] = blockGeoData
    this.blockGeoDataArray[height].blockData = blockData

    return this.blockGeoDataArray[height]
  }

  async initGeometry () {
    window.fetch('https://blockchain.info/blocks/' + this.timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      .then((resp) => resp.json())
      .then(async function (data) {
        data.blocks.forEach(block => {
          this.hashes.push(block.hash)
        })

        let thetaMax = this.coils * (Math.PI * 2)
        let awayStep = (this.radius / thetaMax)
        let chord = this.planeSize + this.planeMargin

        let xOffset
        let zOffset

        let offset = this.planeSize * this.planeOffsetMultiplier

        let theta = (this.planeSize + offset) / awayStep

        console.time('posLoop')
        for (let addCount = 0; addCount < 600000; addCount++) {
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

        let addCount = 0

        await this.asyncForEach(this.hashes, async (hash) => {
          if (addCount < 200) {
            let blockGeoData = await this.getGeometry(hash, addCount)

            // let crystalAO = await this.crystalAOGenerator.getMultiple(this.blockGeoDataArray)
            // crystalAO.renderOrder = 2
            // crystalAO.translateY(0.1)
            // this.scene.add(crystalAO)

            if (!this.geoAdded) {
              this.scene.add(this.planetMesh)

              this.disk = await this.diskGenerator.init(blockGeoData)
              this.disk.renderOrder = 3
              this.scene.add(this.disk)

              this.crystal = await this.crystalGenerator.init(blockGeoData)
              this.scene.add(this.crystal)

              this.trees = await this.treeGenerator.init(blockGeoData)
              this.scene.add(this.trees)

              this.plane = await this.planeGenerator.init(blockGeoData)
              this.plane.renderOrder = 1
              this.scene.add(this.plane)

              let planeX = this.plane.geometry.attributes.planeOffset.array[0]
              let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

              this.camera.position.x = planeX
              this.camera.position.z = planeZ

              this.controls.target = new THREE.Vector3(planeX, 0, planeZ)
              this.controls.update()
              this.geoAdded = true
              this.blockReady = true
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
    // this.controls = new FlyControls(this.camera)
    // this.controls.movementSpeed = 40
    // this.controls.domElement = this.renderer.domElement
    // this.controls.rollSpeed = Math.PI / 24
    // this.controls.autoForward = false
    // this.controls.dragToLook = false

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
  }

  animate () {
    window.requestAnimationFrame(this.animate.bind(this))
    this.renderFrame()
  }

  getClosestBlock () {
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

            let vol = map((blockDist * 0.001), 0, 500, 1.0, 0.0)
            if (vol < 0) {
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
        if (closestDist < 150000 && this.closestBlockReadyForUpdate) {
          this.closestBlockReadyForUpdate = false
          this.emit('blockChanged')
        }
      }
    }
  }

  renderFrame () {
    let delta = this.clock.getDelta()

    this.controls.update(delta)

    // this.getClosestBlock()

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
      this.diskGenerator.update()

      this.crystalGenerator.update(window.performance.now(), window.performance.now(), this.firstLoop)
      this.crystalAOGenerator.update(window.performance.now(), window.performance.now(), this.firstLoop)
    }

    // this.FilmShaderPass.uniforms.time.value = window.performance.now() * 0.00001

    this.renderer.render(this.scene, this.camera)
    // this.composer.render()
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
  }

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

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
    this.blockReadyTime = window.performance.now()

    if (this.shouldDrawUnderside) {
      const nTX = Object.keys(this.closestBlock.blockData.tx).length
      let undersideTexture = await this.circuit.draw(nTX, this.closestBlock)

      let minHeight = Number.MAX_SAFE_INTEGER

      for (const height in this.blockGeoDataArray) {
        if (this.blockGeoDataArray.hasOwnProperty(height)) {
          minHeight = Math.min(height, minHeight)
        }
      }

      let quat = new THREE.Quaternion(
        this.plane.geometry.attributes.quaternion.array[(this.closestBlock.blockData.height - minHeight) * 4 + 0],
        this.plane.geometry.attributes.quaternion.array[(this.closestBlock.blockData.height - minHeight) * 4 + 1],
        this.plane.geometry.attributes.quaternion.array[(this.closestBlock.blockData.height - minHeight) * 4 + 2],
        this.plane.geometry.attributes.quaternion.array[(this.closestBlock.blockData.height - minHeight) * 4 + 3]
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
      this.topside.renderOrder = 2

      this.topside.translateZ(-0.1)
      this.underside.translateZ(4.05)

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
      1,
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
      antialias: true,
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

    // this.FXAAPass.uniforms.resolution.value = new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight)

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
