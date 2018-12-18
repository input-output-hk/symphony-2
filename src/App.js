// libs
import React, { Component } from 'react'
import * as THREE from 'three'
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
import AudioManager from './libs/audio/audioManager'
import Circuit from './libs/circuit'
import * as dat from 'dat.gui'
import TWEEN from 'tween.js'

// Workers
import NearestBlocksWorker from './workers/nearestBlocks.worker.js'
import GetBlockDataWorker from './workers/getBlockData.worker.js'
import GetGeometryWorker from './workers/getGeometry.worker.js'
import BlockHeightWorker from './workers/blockHeight.worker.js'

// Post-Processing
import {
  EffectComposer,
  ShaderPass,
  RenderPass,
  UnrealBloomPass,
  SMAAPass
  // SSAARenderPass
} from './libs/post/EffectComposer'

// import CopyShader from './libs/post/CopyShader'
// import HueSaturation from './libs/post/HueSaturation'
// import BrightnessContrast from './libs/post/BrightnessContrast'
import VignetteShader from './libs/post/Vignette'
import FilmShader from './libs/post/Film'

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'
import Picker from './geometry/picker/Picker'
// import CrystalAO from './geometry/crystalAO/CrystalAO'
import Plane from './geometry/plane/Plane'
import Occlusion from './geometry/occlusion/Occlusion'
import Tree from './geometry/tree/Tree'
import Disk from './geometry/disk/Disk'
// import Tx from './geometry/tx/Tx'
import Underside from './geometry/underside/Underside'
import Particles from './geometry/particles/Particles'

// CSS
import './App.css'

import bitcoinLogo from './assets/images/bitcoin-logo.png'
import downArrow from './assets/images/down-arrow.svg'
import crystalImage from './assets/images/crystal.png'
import iohkLogo from './assets/images/iohk-logo.png'
import txValueKey from './assets/images/tx-value-key.png'
import txSpent from './assets/images/tx-spent.svg'
import txUnspent from './assets/images/tx-unspent.svg'
import txSingle from './assets/images/tx-single.png'

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)

    this.planeSize = 500
    this.planeOffsetMultiplier = 1080
    this.planeMargin = 100
    this.blockReady = false
    this.coils = 100
    this.radius = 1000000

    this.frame = 0

    this.loading = false
    this.blockGeoDataObject = {}
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()

    this.setBlockHashToLoad()
    this.setHeightToLoad()

    this.blockPositions = null
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.closestBlockReadyForUpdate = false
    this.drawCircuits = true
    this.clock = new THREE.Clock()

    this.loadedHeights = []

    this.mousePos = new THREE.Vector2() // keep track of mouse position

    this.blockAnimStartTime = 0

    this.animatingCamera = false

    this.camPosTo = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camPosToTarget = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromPosition = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromRotation = new THREE.Vector3(0.0, 0.0, 0.0)

    this.defaultCamEasing = TWEEN.Easing.Quadratic.InOut

    this.txSpawnLocation = new THREE.Vector3(0.0, 0.0, 0.0)

    this.txSpawnStart = new THREE.Vector3(0, 0, 0)
    this.txSpawnDestination = new THREE.Vector3(0, 0, 0)

    this.cubeCamera = new THREE.CubeCamera(1.0, 2000, 512)
    this.cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter

    this.autoPilot = false
    this.autoPilotDirection = false

    this.state = {
      closestBlock: null,
      controlType: 'map',
      txSelected: null,
      sidebarOpen: false,
      txSearchOpen: false,
      blockSearchOpen: false,
      searchTXHash: '',
      searchBlockHash: ''
    }
  }

  /**
   * Switch renderOrder of elements based on camera position
   */
  setRenderOrder () {
    if (this.camera.position.y > 0) {
      if (this.centerTree) {
        this.centerTree.material.depthWrite = false
      }
      if (this.lTree) {
        this.lTree.material.depthWrite = true
      }
      if (this.rTree) {
        this.rTree.material.depthWrite = true
      }

      this.occlusion.renderOrder = 0

      // this.txs.renderOrder = 8

      this.particles.renderOrder = -1

      this.crystal.renderOrder = 1
      this.trees.renderOrder = 0
      this.disk.renderOrder = 2
      this.plane.renderOrder = 3
      // this.crystalAO.renderOrder = 6

      this.underside.position.y = -0.1
      this.undersideL.position.y = -0.1
      this.undersideR.position.y = -0.1

      this.underside.renderOrder = 2
      this.undersideL.renderOrder = 2
      this.undersideR.renderOrder = 2

      this.planetMesh.renderOrder = -1
    } else {
      if (this.centerTree) {
        this.centerTree.material.depthWrite = true
      }
      if (this.lTree) {
        this.lTree.material.depthWrite = true
      }
      if (this.rTree) {
        this.rTree.material.depthWrite = true
      }

      this.occlusion.renderOrder = 10

      this.underside.position.y = -1.05
      this.undersideL.position.y = -1.05
      this.undersideR.position.y = -1.05

      this.crystal.renderOrder = 1
      // this.crystalAO.renderOrder = 2
      this.plane.renderOrder = 3
      this.underside.renderOrder = 4
      this.undersideL.renderOrder = 4
      this.undersideR.renderOrder = 4
      this.trees.renderOrder = 5
      this.disk.renderOrder = 6
      this.planetMesh.renderOrder = 7
    }

    if (this.camera.position.y > 30000) {
      this.disk.renderOrder = -1
    }
  }

  componentDidMount () {
    this.initStage()
  }

  async initStage () {
    await this.initFirebase()

    this.circuit = new Circuit({FBStorageCircuitRef: this.FBStorageCircuitRef, config: this.config})
    this.audio = new AudioManager({
      sampleRate: this.config.audio.sampleRate,
      soundDuration: this.config.audio.soundDuration,
      noteDuration: this.config.audio.noteDuration
    })

    this.crystalGenerator = new Crystal({
      firebaseDB: this.firebaseDB,
      planeSize: this.planeSize,
      config: this.config
    })

    this.pickerGenerator = new Picker({
      planeSize: this.planeSize,
      config: this.config
    })

    // this.crystalAOGenerator = new CrystalAO({
    //   firebaseDB: this.firebaseDB,
    //   planeSize: this.planeSize,
    //   config: this.config
    // })

    this.planeGenerator = new Plane({
      planeSize: this.planeSize,
      config: this.config
    })

    this.occlusionGenerator = new Occlusion({
      planeSize: this.planeSize,
      config: this.config
    })

    this.treeGenerator = new Tree({
      planeSize: this.planeSize,
      config: this.config
    })

    this.undersideGenerator = new Underside({
      planeSize: this.planeSize,
      config: this.config
    })

    // this.txGenerator = new Tx({
    //   config: this.config
    // })

    this.particlesGenerator = new Particles({
      planeSize: this.planeSize,
      config: this.config
    })

    this.diskGenerator = new Disk({
      planeSize: this.planeSize,
      config: this.config
    })

    this.heightsToLoad = []
    this.loadingMutex = []

    this.canvas = document.getElementById(this.config.scene.canvasID)

    this.initGUI()
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

  async initUnconfirmedTX () {
    let txData = await window.fetch('https://blockchain.info/unconfirmed-transactions?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    let txDataJSON = await txData.json()

    await this.asyncForEach(txDataJSON.txs, async (tx) => {
      await this.asyncForEach(tx.inputs, (input) => {
        return new Promise(async (resolve, reject) => {
          let inputData = await window.fetch('https://blockchain.info/rawtx/' + input.prev_out.tx_index + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
          let inputDataJSON = await inputData.json()

          let blockHeight = inputDataJSON.block_height

          if (
            typeof this.blockPositions[blockHeight * 2 + 0] === 'undefined' ||
              typeof this.blockPositions[blockHeight * 2 + 1] === 'undefined'
          ) {
            resolve()
          } else {
            this.txSpawnStart.x = this.blockPositions[blockHeight * 2 + 0]
            this.txSpawnStart.y = 0.0
            this.txSpawnStart.z = this.blockPositions[blockHeight * 2 + 1]

            this.txSpawnDestination.x = this.blockPositions[blockHeight * 2 + 0]
            this.txSpawnDestination.y = 500.0
            this.txSpawnDestination.z = this.blockPositions[blockHeight * 2 + 1]

            let toCenter = this.txSpawnStart.clone()
            toCenter.normalize()

            let that = this
            new TWEEN.Tween(that.txSpawnStart)
              .to(
                toCenter.multiplyScalar(460000),
                3000
              )
              .onUpdate(function () {
                that.txSpawnStart.x = this.x
                that.txSpawnStart.y = this.y
                that.txSpawnStart.z = this.z
              })
              .onComplete(() => {
                resolve()
              })
              .easing(TWEEN.Easing.Quadratic.In)
              .start()
          }
        })
      })
      return true
    })
  }

  initGUI () {
    if (this.config.showGUI) {
      this.gui = new dat.GUI()
      this.gui.add(this.diskGenerator, 'uRadiusMultiplier', 8257.34, 8257.4)
      this.gui.add(this.diskGenerator, 'uOffset', 0.01, 1.00)
    }
  }

  initPicker () {
    this.lastHoveredID = -1
    this.lastSelectedID = -1
    this.pickingScene = new THREE.Scene()
    this.pickingTexture = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight)
    this.pickingTexture.texture.minFilter = THREE.LinearFilter
    this.pickingTexture.texture.generateMipmaps = false
  }

  onMouseMove (e) {
    this.mousePos.x = e.clientX
    this.mousePos.y = e.clientY
  }

  updatePicker () {
    if (!this.closestBlock) {
      return
    }

    this.renderer.setClearColor(0)
    this.renderer.render(this.pickingScene, this.camera, this.pickingTexture)

    let pixelBuffer = new Uint8Array(4)

    let canvasOffset = this.renderer.domElement.getBoundingClientRect()

    this.renderer.readRenderTargetPixels(
      this.pickingTexture,
      this.mousePos.x - canvasOffset.left,
      this.pickingTexture.height - (this.mousePos.y - canvasOffset.top),
      1,
      1,
      pixelBuffer
    )

    let id = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2] - 1)

    if (this.lastHoveredID !== id) {
      this.lastHoveredID = id

      if (typeof this.pickerGenerator.txMap[id] !== 'undefined') {
        this.hoveredTXHash = this.pickerGenerator.txMap[id]

        this.emit('txMouseOver', {
          txData: this.hoveredTXHash,
          mousePos: this.mousePos
        })

        this.txIsHovered = true
        document.body.style.cursor = 'pointer'
      } else {
        this.emit('txMouseOut', {
          mousePos: this.mousePos
        })

        this.hoveredLight.position.x = -999999
        this.hoveredLight.position.z = -999999

        this.txIsHovered = false
        document.body.style.cursor = 'default'
      }

      // update isHovered attribute
      let hoveredArray = new Float32Array(this.crystalGenerator.instanceTotal)
      if (this.lastHoveredID !== -1) {
        const txIndexOffset = this.crystalGenerator.txIndexOffsets[this.closestBlock.blockData.height]

        let selectedPosX = this.crystal.geometry.attributes.offset.array[(this.lastHoveredID + txIndexOffset) * 3 + 0] - this.originOffset.x
        let selectedPosZ = this.crystal.geometry.attributes.offset.array[(this.lastHoveredID + txIndexOffset) * 3 + 2] - this.originOffset.y

        this.hoveredLight.position.x = selectedPosX
        this.hoveredLight.position.z = selectedPosZ

        hoveredArray[this.lastHoveredID + txIndexOffset] = 1.0
      }
      this.crystal.geometry.attributes.isHovered.array = hoveredArray
      this.crystal.geometry.attributes.isHovered.needsUpdate = true
    }
  }

  async selectTX (index, TXHash) {
    this.emit('txSelect', {
      txData: TXHash,
      mousePos: this.mousePos
    })

    this.audio.playNote(this.closestBlock.blockData, index + 1)

    // get tx data
    let txData = await window.fetch('https://blockchain.info/rawtx/' + TXHash + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    let txDataJSON = await txData.json()

    let outTotal = 0
    let inTotal = 0

    let outputsSpent = 0
    txDataJSON.out.forEach((output) => {
      outTotal += output.value
      outputsSpent += output.spent ? 1 : 0
    })

    txDataJSON.spentRatio = 1
    if (outputsSpent !== 0) {
      txDataJSON.spentRatio = outputsSpent / txDataJSON.out.length
    } else {
      txDataJSON.spentRatio = 0.0
    }

    txDataJSON.inputs.forEach((input, i) => {
      if (typeof input.prev_out !== 'undefined') {
        inTotal += input.prev_out.value
      }
    })

    txDataJSON.inTotal = inTotal / 100000000
    txDataJSON.outTotal = outTotal / 100000000
    txDataJSON.fee = (inTotal - outTotal) / 100000000
    if (txDataJSON.fee < 0) {
      txDataJSON.fee = 0
    }

    this.setState({
      txSelected: txDataJSON
    })

    // update isSelected attribute
    let selectedArray = new Float32Array(this.crystalGenerator.instanceTotal)
    if (index !== -1) {
      const txIndexOffset = this.crystalGenerator.txIndexOffsets[this.closestBlock.blockData.height]

      let selectedPosX = this.crystal.geometry.attributes.offset.array[(index + txIndexOffset) * 3 + 0] - this.originOffset.x
      let selectedPosY = 50 + (this.crystal.geometry.attributes.offset.array[(index + txIndexOffset) * 3 + 1])
      let selectedPosZ = this.crystal.geometry.attributes.offset.array[(index + txIndexOffset) * 3 + 2] - this.originOffset.y

      this.selectedLight.position.x = selectedPosX
      this.selectedLight.position.z = selectedPosZ

      let to = new THREE.Vector3(this.camera.position.x, selectedPosY, this.camera.position.z)
      let toTarget = new THREE.Vector3(selectedPosX + this.originOffset.x, 0, selectedPosZ + this.originOffset.y)

      this.prepareCamAnim(
        to,
        toTarget
      )

      let that = this
      new TWEEN.Tween(this.camera.position)
        .to(new THREE.Vector3(to.x, to.y, to.z), 2000)
        .onUpdate(function () {
          that.camera.position.set(this.x, this.y, this.z)
        })
        .onComplete(() => {
          that.toggleMapControls(false)
          this.controls.target = new THREE.Vector3(toTarget.x, 0, toTarget.z)
          this.camera.position.x = to.x
          this.camera.position.z = to.z

          this.setState({searchTXHash: ''})

          this.animatingCamera = false
        })
        .easing(this.defaultCamEasing)
        .start()

      this.animateCamRotation(2000)

      selectedArray[index + txIndexOffset] = 1.0
    }

    this.crystal.geometry.attributes.isSelected.array = selectedArray
    this.crystal.geometry.attributes.isSelected.needsUpdate = true
  }

  async onMouseUp () {
    if (this.animatingCamera) {
      return
    }

    if (!this.mousePos) {
      return
    }

    let mouseMoveVec = this.mousePos.clone().sub(this.lastMousePos)

    // clicking on the same tx twice deselects
    if (this.lastSelectedID === this.lastHoveredID) {
      this.lastSelectedID = -1
      this.emit('txDeselect', {})

      this.audio.stopNotes()

      this.setState({
        txSelected: null
      })

      this.selectedLight.position.x = -999999
      this.selectedLight.position.z = -999999

      // update isSelected attribute
      let selectedArray = new Float32Array(this.crystalGenerator.instanceTotal)
      this.crystal.geometry.attributes.isSelected.array = selectedArray
      this.crystal.geometry.attributes.isSelected.needsUpdate = true
    } else {
      if (mouseMoveVec.lengthSq() > 10) {
        return
      }

      if (this.txIsHovered) {
        this.lastSelectedID = this.lastHoveredID

        if (typeof this.pickerGenerator.txMap[this.lastHoveredID] !== 'undefined') {
          this.selectedTXHash = this.pickerGenerator.txMap[this.lastHoveredID]

          this.selectTX(this.lastSelectedID, this.selectedTXHash)
        }
      } else {
        this.lastSelectedID = -1
        this.emit('txDeselect', {})

        this.audio.stopNotes()

        this.selectedLight.position.x = -999999
        this.selectedLight.position.z = -999999

        this.setState({
          txSelected: null
        })

        // update isSelected attribute
        let selectedArray = new Float32Array(this.crystalGenerator.instanceTotal)
        this.crystal.geometry.attributes.isSelected.array = selectedArray
        this.crystal.geometry.attributes.isSelected.needsUpdate = true
      }
    }
  }

  onMouseDown () {
    this.lastMousePos = new THREE.Vector2(this.mousePos.x, this.mousePos.y)
  }

  setBlockHashToLoad () {
    this.blockHashToLoad = null
    if (typeof URLSearchParams !== 'undefined') {
      let urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('hash')) {
        this.blockHashToLoad = urlParams.get('hash')
      }
    }
  }

  setHeightToLoad () {
    this.heightToLoad = null
    if (typeof URLSearchParams !== 'undefined') {
      let urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('height')) {
        this.heightToLoad = urlParams.get('height')
      }
    }
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
    // this.ssaaRenderPass = new SSAARenderPass(this.scene, this.camera)
    // this.ssaaRenderPass.unbiased = true
    // this.composer.addPass(this.ssaaRenderPass)

    // this.HueSaturationPass = new ShaderPass(HueSaturation)
    // this.composer.addPass(this.HueSaturationPass)

    // this.BrightnessContrastPass = new ShaderPass(BrightnessContrast)
    // this.composer.addPass(this.BrightnessContrastPass)

    // res, strength, radius, threshold
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 2.5, 0.4)
    this.composer.addPass(this.bloomPass)

    this.VignettePass = new ShaderPass(VignetteShader)
    // this.VignettePass.renderToScreen = true
    this.composer.addPass(this.VignettePass)

    this.FilmShaderPass = new ShaderPass(FilmShader)
    // this.FilmShaderPass.renderToScreen = true
    this.composer.addPass(this.FilmShaderPass)

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

    // this.anonymousSignin()

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
      const getBlockDataWorker = new GetBlockDataWorker()
      getBlockDataWorker.onmessage = async ({ data }) => {
        resolve(data.blockData)
        getBlockDataWorker.terminate()
      }
      getBlockDataWorker.postMessage({ cmd: 'get', config: this.config, hash: hash })
    })
  }

  initLights () {
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

    this.saturnmap = new THREE.TextureLoader()
      .load(
        'assets/images/textures/saturnmap-cold.jpg'
      )

    this.planetGeo = new THREE.SphereBufferGeometry(460000, 100, 100)
    this.planetMat = new THREE.MeshStandardMaterial({
      fog: false,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.3,
      roughness: 0.8,
      envMap: this.planetMap,
      map: this.saturnmap
    })

    this.planetMesh = new THREE.Mesh(this.planetGeo, this.planetMat)

    this.sunGeo = new THREE.SphereBufferGeometry(200000, 25, 25)
    this.sunMat = new THREE.MeshBasicMaterial({
      fog: false,
      color: 0xffe083
    })

    this.sunLight = new THREE.PointLight(0xffffff, 0.5, 0.0, 0.0)
    this.sunLight.position.set(0, 10000000, 20000000)
    this.group.add(this.sunLight)

    this.hoveredLight = new THREE.PointLight(0xffffff, 0.1, 500.0)
    this.hoveredLight.position.set(-999999, 5, -999999)
    this.group.add(this.hoveredLight)

    this.selectedLight = new THREE.PointLight(0xffffff, 0.1, 500.0)
    this.selectedLight.position.set(-999999, 20, -999999)
    this.group.add(this.selectedLight)
  }

  async asyncForEach (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }

  async getGeometry (hash, blockHeight = null) {
    return new Promise(async (resolve, reject) => {
      if (blockHeight && typeof this.blockGeoDataObject[blockHeight] !== 'undefined') {
        return
      }

      let blockData = await this.getBlockData(hash)

      const getGeometryWorker = new GetGeometryWorker()
      getGeometryWorker.onmessage = ({ data }) => {
        let blockGeoData = data.blockGeoData

        const height = parseInt(blockData.height, 10)

        blockData.pos = {
          x: this.blockPositions[height * 2 + 0],
          z: this.blockPositions[height * 2 + 1]
        }

        this.blockGeoDataObject[height] = blockGeoData
        this.blockGeoDataObject[height].blockData = blockData

        getGeometryWorker.terminate()

        resolve(this.blockGeoDataObject[height])
      }
      getGeometryWorker.postMessage({
        cmd: 'get',
        config: this.config,
        blockData: blockData,
        planeSize: this.planeSize
      })
    })
  }

  async initEnvironment () {
    this.group.add(this.planetMesh)

    this.disk = await this.diskGenerator.init()

    this.group.add(this.disk)
  }

  async initPositions () {
    let timestampToLoad = moment().valueOf() // default to today's date
    let latestBlockData = await window.fetch('https://blockchain.info/blocks/' + timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    let latestBlockDataJSON = await latestBlockData.json()
    this.maxHeight = latestBlockDataJSON.blocks[0].height

    this.blockPositions = new Float32Array((this.maxHeight * 2) + 2)

    let thetaMax = this.coils * (Math.PI * 2)
    let awayStep = (this.radius / thetaMax)
    let chord = this.planeSize + this.planeMargin

    let xOffset
    let zOffset

    let offset = this.planeSize * this.planeOffsetMultiplier

    let theta = (this.planeSize + offset) / awayStep

    for (let i = this.maxHeight; i >= 0; i--) {
      let away = awayStep * theta
      xOffset = Math.cos(theta) * away
      zOffset = Math.sin(theta) * away

      this.blockPositions[i * 2 + 0] = xOffset
      this.blockPositions[i * 2 + 1] = zOffset

      theta += chord / away
    }
  }

  async initGeometry () {
    if (!this.blockHashToLoad) {
      let url
      if (this.heightToLoad !== null) {
        const baseUrl = 'https://us-central1-webgl-gource-1da99.cloudfunctions.net/cors-proxy?url='
        url = baseUrl + encodeURIComponent('https://blockchain.info/block-height/' + this.heightToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      } else {
        url = 'https://blockchain.info/blocks/' + this.timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode
      }
      let blockData = await window.fetch(url)
      let blockDataJSON = await blockData.json()
      this.blockHashToLoad = blockDataJSON.blocks[0].hash
    }

    let blockGeoData = await this.getGeometry(this.blockHashToLoad)

    this.closestHeight = blockGeoData.blockData.height

    this.crystal = await this.crystalGenerator.init(blockGeoData)

    this.initPicker()
    this.picker = await this.pickerGenerator.init(blockGeoData)
    this.pickingScene.add(this.picker)

    this.group.add(this.crystal)

    // this.crystalAO = await this.crystalAOGenerator.init(blockGeoData)
    // this.crystalAO.translateY(0.1)
    // this.group.add(this.crystalAO)

    // this.txs = await this.txGenerator.init(this.blockPositions, blockGeoData.blockData.height)

    // this.group.add(this.txs)

    this.trees = await this.treeGenerator.init(blockGeoData)
    this.group.add(this.trees)

    this.plane = await this.planeGenerator.init(blockGeoData)
    this.group.add(this.plane)

    this.occlusion = await this.occlusionGenerator.init(blockGeoData)

    this.particles = await this.particlesGenerator.init({
      blockGeoData: blockGeoData,
      renderer: this.renderer
    })

    this.group.add(this.occlusion)

    let planeX = this.plane.geometry.attributes.planeOffset.array[0]
    let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

    this.camera.position.x = planeX
    this.camera.position.z = planeZ

    this.group.add(this.particles)
    // this.txSpawnStart = new THREE.Vector3(planeX, 1000000000, planeZ)

    this.controls.target = new THREE.Vector3(planeX, 0, planeZ)

    this.group.position.x += planeX
    this.group.position.z += planeZ

    this.originOffset = new THREE.Vector2(planeX, planeZ)

    this.treeGenerator.updateOriginOffset(this.originOffset)
    this.planeGenerator.updateOriginOffset(this.originOffset)
    this.occlusionGenerator.updateOriginOffset(this.originOffset)
    this.crystalGenerator.updateOriginOffset(this.originOffset)
    this.particlesGenerator.updateOriginOffset(this.originOffset)
    // this.crystalAOGenerator.updateOriginOffset(this.originOffset)
    this.diskGenerator.updateOriginOffset(this.originOffset)
    // this.txGenerator.updateOriginOffset(this.originOffset)

    this.planetMesh.position.x -= this.originOffset.x
    this.planetMesh.position.z -= this.originOffset.y

    // this.txSpawnDestination = new THREE.Vector3(this.originOffset.x, 0.0, this.originOffset.y)

    this.closestBlockReadyForUpdate = true

    this.closestBlock = blockGeoData

    let undersideGroup = await this.undersideGenerator.init()

    this.underside = undersideGroup.underside
    this.undersideL = undersideGroup.undersideL
    this.undersideR = undersideGroup.undersideR

    this.group.add(this.underside)
    this.group.add(this.undersideL)
    this.group.add(this.undersideR)

    this.blockReady = true

    this.unconfirmedLoop()

    return true
  }

  async unconfirmedLoop () {
    await this.initUnconfirmedTX()

    this.unconfirmedLoop()
  }

  createCubeMap (pos) {
    // console.time('cubemap')
    this.scene.background = this.crystalGenerator.cubeMap

    this.cubeCamera = new THREE.CubeCamera(1.0, 1500, 512)
    this.cubeCamera.position.copy(pos)

    this.cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter
    this.cubeCamera.update(this.renderer, this.scene)

    this.crystal.material.envMap = this.cubeCamera.renderTarget.texture
    // this.plane.material.envMap = this.cubeCamera.renderTarget.texture
    this.trees.material.envMap = this.cubeCamera.renderTarget.texture

    if (this.centerTree) {
      this.centerTree.material.envMap = this.cubeCamera.renderTarget.texture
    }
    if (this.lTree) {
      this.lTree.material.envMap = this.cubeCamera.renderTarget.texture
    }
    if (this.rTree) {
      this.rTree.material.envMap = this.cubeCamera.renderTarget.texture
    }

    this.scene.background = this.cubeMap
    // console.timeEnd('cubemap')
  }

  initControls () {
    this.toggleMapControls()
  }

  toggleMapControls (setPos = true, target) {
    this.switchControls('map')
    if (this.closestBlock) {
      if (setPos) {
        if (target) {
          this.controls.target = target
          this.camera.position.x = target.x
          this.camera.position.y = 500
          this.camera.position.z = target.z
        } else {
          this.controls.target = new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
          this.camera.position.x = this.closestBlock.blockData.pos.x
          this.camera.position.y = 500
          this.camera.position.z = this.closestBlock.blockData.pos.z
        }
      }
    }
  }

  stopAutoPilotAnimation () {
    if (typeof this.autoPilotTween !== 'undefined') {
      this.autoPilotTween.stop()
    }

    if (typeof this.cameraRotationTween !== 'undefined') {
      this.cameraRotationTween.stop()
    }

    this.autoPilot = false
  }

  toggleUndersideControls () {
    this.switchControls('underside')
    this.controls.maxPolarAngle = Math.PI * 2
  }

  toggleFlyControls () {
    this.switchControls('fly')
  }

  switchControls (type) {
    this.stopAutoPilotAnimation()

    if (this.controls) {
      this.controls.dispose()
      this.controls = null
    }

    this.animatingCamera = false

    switch (type) {
      case 'map':
      case 'underside':
        this.controls = new MapControls(this.camera)
        this.controls.domElement = this.renderer.domElement
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.25
        this.controls.screenSpacePanning = true
        this.controls.minDistance = 50
        this.controls.maxDistance = 10000000
        this.controls.maxPolarAngle = Math.PI / 2
        this.controls.rotateSpeed = 0.05
        this.controls.panSpeed = 0.25
        this.controls.zoomSpeed = 0.5

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

  prepareCamAnim (to, toTarget) {
    this.animatingCamera = true

    if (this.controls) {
      this.controls.dispose()
      this.controls = null
    }

    this.camPosTo = to
    this.camPosTarget = toTarget

    this.camFromPosition = new THREE.Vector3().copy(this.camera.position)
    this.camFromRotation = new THREE.Euler().copy(this.camera.rotation)

    // set final position and grab final rotation
    this.camera.position.set(this.camPosTo.x, this.camPosTo.y, this.camPosTo.z)

    this.camera.lookAt(this.camPosTarget)
    this.camToRotation = new THREE.Euler().copy(this.camera.rotation)

    // reset original position and rotation
    this.camera.position.set(this.camFromPosition.x, this.camFromPosition.y, this.camFromPosition.z)
    this.camera.rotation.set(this.camFromRotation.x, this.camFromRotation.y, this.camFromRotation.z)

    // rotate with slerp
    this.camFromQuaternion = new THREE.Quaternion().copy(this.camera.quaternion)
    this.camToQuaternion = new THREE.Quaternion().setFromEuler(this.camToRotation)
    this.camMoveQuaternion = new THREE.Quaternion()
    this.camera.quaternion.set(this.camMoveQuaternion)
  }

  toggleTopView () {
    this.stopAutoPilotAnimation()
    this.prepareCamAnim(
      new THREE.Vector3(this.closestBlock.blockData.pos.x, 500, this.closestBlock.blockData.pos.z),
      new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
    )

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(this.camPosTo, 3000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        this.toggleMapControls()
        this.controls.target = this.camPosTarget
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(3000)
  }

  async toggleUndersideView () {
    this.stopAutoPilotAnimation()
    // await this.updateClosestTrees()

    let to = new THREE.Vector3(this.closestBlock.blockData.pos.x - 100, -300, this.closestBlock.blockData.pos.z - 100)
    let toTarget = new THREE.Vector3(this.closestBlock.blockData.pos.x - 90, 0, this.closestBlock.blockData.pos.z - 90)

    this.prepareCamAnim(
      to,
      toTarget
    )

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(this.camPosTo, 5000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        that.toggleUndersideControls()
        that.controls.target = that.camPosTarget
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(5000)
  }

  setConfig (newConfig) {
    this.config = deepAssign(this.config, newConfig)

    this.setControlsSettings()
    this.setCameraSettings()
  }

  getClosestBlock () {
    if (this.camera.position.y >= 2000) {
      this.setState({closestBlock: null})
      this.closestBlockReadyForUpdate = true
      return
    }

    this.prevClosestBlock = this.closestBlock
    if (Object.keys(this.blockGeoDataObject).length > 0) {
      let closestDist = Number.MAX_SAFE_INTEGER

      for (const height in this.blockGeoDataObject) {
        if (this.blockGeoDataObject.hasOwnProperty(height)) {
          const blockGeoData = this.blockGeoDataObject[height]

          const blockPos = new THREE.Vector3(blockGeoData.blockData.pos.x, 0, blockGeoData.blockData.pos.z)
          const blockDist = blockPos.distanceToSquared(this.camera.position)

          if (typeof this.audio.gainNodes[height] !== 'undefined') {
            let vol = map((blockDist * 0.001), 0, 200, 0.5, 0.0)
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

  async loadNearestBlocks (ignoreCamPos = false, closestHeight = null) {
    if (this.loading) {
      return
    }

    if (!ignoreCamPos) {
      if (this.camera.position.y > 20000) {
        this.loading = false
        return
      }
    }

    let loadNew = false

    if (ignoreCamPos) {
      loadNew = true
    }

    if (typeof this.lastLoadPos === 'undefined') {
      this.lastLoadPos = {
        x: this.camera.position.x,
        z: this.camera.position.z
      }
      loadNew = true
    }

    if (!ignoreCamPos) {
      if (
        Math.abs(this.camera.position.x - this.lastLoadPos.x) > 500 ||
        Math.abs(this.camera.position.z - this.lastLoadPos.z) > 500
      ) {
        loadNew = true
      }
    }

    if (!loadNew) {
      this.loading = false
      return
    }

    console.log('loadNearestBlocks')

    this.loading = true

    this.lastLoadPos = {
      x: this.camera.position.x,
      z: this.camera.position.z
    }

    if (closestHeight !== null) {
      this.closestHeight = closestHeight
    } else {
      let closestDist = Number.MAX_SAFE_INTEGER

      let camVec = new THREE.Vector2(this.camera.position.x, this.camera.position.z)

      let start = this.closestHeight - 20
      let end = this.closestHeight + 20
      if (this.state.controlType === 'fly' || this.state.controlType === 'map') {
        start = 0,
        end = this.blockPositions.length / 2
      }

      if (start < 0) {
        start = 0
      }

      if (end > this.blockPositions.length / 2) {
        end = this.blockPositions.length / 2
      }

      for (let index = start; index < end; index++) {
        const xComponent = this.blockPositions[index * 2 + 0] - camVec.x
        const zComponent = this.blockPositions[index * 2 + 1] - camVec.y
        const dist = (xComponent * xComponent) + (zComponent * zComponent)

        if (dist < closestDist) {
          closestDist = dist
          this.closestHeight = index
        }
      }
    }

    // unload blocks n away from closest block
    for (const height in this.blockGeoDataObject) {
      if (this.blockGeoDataObject.hasOwnProperty(height)) {
        if (
          height < this.closestHeight - 25 ||
            height > this.closestHeight + 25
        ) {
          delete this.blockGeoDataObject[height]

          // console.log('deleted blockdata at: ' + height)
        }
      }
    }

    this.loadedHeights.forEach((height, i) => {
      if (
        height < this.closestHeight - 25 ||
          height > this.closestHeight + 25
      ) {
        // console.log('deleted height at: ' + height)
        delete this.loadedHeights[ i ]
      }
    })

    let closestBlocksData = []
    let closestBlocksGeoData = []
    let nearestBlocks = []

    nearestBlocks.push(this.closestHeight)
    for (let i = 1; i < 25; i++) {
      let next = this.closestHeight + i
      let prev = this.closestHeight - i

      if (next <= this.maxHeight && next >= 0) {
        nearestBlocks.push(next)
      }

      if (prev <= this.maxHeight && prev >= 0) {
        nearestBlocks.push(prev)
      }
    }

    nearestBlocks.forEach((height) => {
      if (this.loadedHeights.indexOf(height) === -1) {
        this.loadedHeights.push(height)

        let blockGeoDataTemp = {}
        blockGeoDataTemp.blockData = {}
        blockGeoDataTemp.blockData.height = height
        blockGeoDataTemp.blockData.pos = {}
        blockGeoDataTemp.blockData.pos.x = this.blockPositions[height * 2 + 0]
        blockGeoDataTemp.blockData.pos.z = this.blockPositions[height * 2 + 1]

        this.planeGenerator.updateGeometry(blockGeoDataTemp)
        this.occlusionGenerator.updateGeometry(blockGeoDataTemp)
        this.treeGenerator.updateGeometry(blockGeoDataTemp)
      }
    })

    const nearestBlocksWorker = new NearestBlocksWorker()
    nearestBlocksWorker.onmessage = async ({ data }) => {
      if (typeof data.closestBlocksData !== 'undefined') {
        closestBlocksData = data.closestBlocksData
        closestBlocksGeoData = data.closestBlocksGeoData

        closestBlocksGeoData.forEach(async (blockGeoData, i) => {
          if (typeof this.blockGeoDataObject[blockGeoData.height] === 'undefined') {
            if (typeof closestBlocksData[i] !== 'undefined') {
              if (
                blockGeoData.height < this.closestHeight - 10 ||
                  blockGeoData.height > this.closestHeight + 10
              ) {
                console.log('moved too far away from block at height: ' + blockGeoData.height)
                return
              }

              blockGeoData.blockData = closestBlocksData[i]

              blockGeoData.blockData.pos = {}
              blockGeoData.blockData.pos.x = this.blockPositions[blockGeoData.height * 2 + 0]
              blockGeoData.blockData.pos.z = this.blockPositions[blockGeoData.height * 2 + 1]

              blockGeoData.blockData.healthRatio = (blockGeoData.blockData.fee / blockGeoData.blockData.outputTotal) * 2000 // 0 == healthy

              this.blockGeoDataObject[blockGeoData.height] = blockGeoData

              this.crystalGenerator.updateGeometry(blockGeoData)
              // this.crystalAOGenerator.updateGeometry(blockGeoData)
            }
          }
        })

        if (typeof this.blockGeoDataObject[this.closestHeight] === 'undefined') {
          if (this.heightsToLoad.indexOf(this.closestHeight) === -1) {
            this.heightsToLoad.push(this.closestHeight)
          }
        }

        for (let i = 1; i < 5; i++) {
          let next = this.closestHeight + i
          let prev = this.closestHeight - i

          if (typeof this.blockGeoDataObject[next] === 'undefined') {
            if (next <= this.maxHeight && next >= 0) {
              if (this.heightsToLoad.indexOf(next) === -1) {
                this.heightsToLoad.push(next)
              }
            }
          }

          if (typeof this.blockGeoDataObject[prev] === 'undefined') {
            if (prev <= this.maxHeight && prev >= 0) {
              if (this.heightsToLoad.indexOf(prev) === -1) {
                this.heightsToLoad.push(prev)
              }
            }
          }
        }

        console.log(this.heightsToLoad)

        this.heightsToLoad.forEach(async (height) => {
          if (this.loadingMutex.indexOf(height) === -1) {
            this.loadingMutex.push(height)

            if (typeof this.blockGeoDataObject[height] === 'undefined') {
              if (
                height < this.closestHeight - 10 ||
                  height > this.closestHeight + 10
              ) {
                console.log('moved too far away from block at height: ' + height)
                return
              }

              const blockHeightWorker = new BlockHeightWorker()
              blockHeightWorker.onmessage = async ({ data }) => {
                if (typeof data.blockDataJSON !== 'undefined') {
                  let blockGeoData = await this.getGeometry(data.blockDataJSON.blocks[0].hash, height)

                  if (
                    height < this.closestHeight - 10 ||
                      height > this.closestHeight + 10
                  ) {
                    console.log('moved too far away from block at height: ' + height)
                    return
                  }

                  if (blockGeoData) {
                    if (typeof this.blockGeoDataObject[blockGeoData.height] === 'undefined') {
                      this.crystalGenerator.updateGeometry(blockGeoData)
                      // this.crystalAOGenerator.updateGeometry(blockGeoData)
                    }
                  }

                  let heightIndex = this.heightsToLoad.indexOf(height)
                  if (heightIndex > -1) {
                    this.heightsToLoad.splice(heightIndex, 1)
                  }
                  let mutexIndex = this.loadingMutex.indexOf(height)
                  if (mutexIndex > -1) {
                    this.heightsToLoad.splice(mutexIndex, 1)
                  }

                  blockHeightWorker.terminate()
                }
              }
              blockHeightWorker.postMessage({ cmd: 'get', config: this.config, height: height })
            }
          }
        })

        this.loading = false

        nearestBlocksWorker.terminate()
      }
    }
    nearestBlocksWorker.postMessage({ cmd: 'get', closestHeight: this.closestHeight, config: this.config })
  }

  toggleTxSearch () {
    this.setState({
      blockSearchOpen: false,
      txSearchOpen: !this.state.txSearchOpen
    })
  }

  toggleBlockSearch () {
    this.setState({
      txSearchOpen: false,
      blockSearchOpen: !this.state.blockSearchOpen
    })
  }

  hideMerkleDetail () {
    this.underside.visible = false
    this.underside.position.x = 0
    this.underside.position.z = 0

    this.undersideL.visible = false
    this.undersideL.position.x = 0
    this.undersideL.position.z = 0

    this.undersideR.visible = false
    this.undersideR.position.x = 0
    this.undersideR.position.z = 0
  }

  goToRandomBlock () {
    this.audio.stopNotes()

    this.autoPilotDirection = false
    this.autoPilot = false

    this.hideMerkleDetail()

    const randomHeight = Math.round(Math.random() * this.maxHeight)

    this.closestHeight = randomHeight

    this.loadNearestBlocks(true, randomHeight)

    this.toggleSidebar()

    let posX = this.blockPositions[randomHeight * 2 + 0]
    let posZ = this.blockPositions[randomHeight * 2 + 1]

    let to = new THREE.Vector3(posX, 1000000, posZ)
    let toTarget = new THREE.Vector3(posX, 0, posZ)

    this.prepareCamAnim(to, toTarget)

    let aboveStart = this.camera.position.clone()
    aboveStart.y = 1000000

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(aboveStart, 5000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        new TWEEN.Tween(that.camera.position)
          .to(to, 5000)
          .onUpdate(function () {
            that.camera.position.set(this.x, this.y, this.z)
          })
          .onComplete(() => {
            new TWEEN.Tween(this.camera.position)
              .to(new THREE.Vector3(to.x, 500, to.z), 10000)
              .onUpdate(function () {
                that.camera.position.set(this.x, this.y, this.z)
              })
              .onComplete(() => {
                this.toggleMapControls(true, toTarget)
                this.animatingCamera = false
              })
              .easing(this.defaultCamEasing)
              .start()
          })
          .easing(this.defaultCamEasing)
          .start()
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(10000)
  }

  stopAutoPilot () {
    this.toggleTopView()
  }

  toggleAutoPilotDirection (direction = 'backward') {
    if (typeof this.autoPilotTween !== 'undefined') {
      this.autoPilotTween.stop()
    }

    if (typeof this.cameraRotationTween !== 'undefined') {
      this.cameraRotationTween.stop()
    }

    this.autoPilot = false

    this.autoPilotDirection = direction

    this.startAutoPilot()
  }

  startAutoPilot () {
    this.audio.stopNotes()

    this.setAutoPilotState()
    this.autoPilotAnimLoop()
  }

  setAutoPilotState () {
    this.setState({
      sidebarOpen: false,
      controlType: 'autopilot'
    })

    this.autoPilot = true
  }

  autoPilotAnimLoop () {
    if (!this.autoPilot) {
      return
    }

    let posX
    let posZ
    if (this.autoPilotDirection === 'backward') {
      posX = this.blockPositions[(this.closestBlock.blockData.height - 1) * 2 + 0]
      posZ = this.blockPositions[(this.closestBlock.blockData.height - 1) * 2 + 1]
    } else {
      posX = this.blockPositions[(this.closestBlock.blockData.height + 1) * 2 + 0]
      posZ = this.blockPositions[(this.closestBlock.blockData.height + 1) * 2 + 1]
    }

    if (typeof posX === 'undefined') {
      return
    }

    let toBlockVec = new THREE.Vector3(posX, 50, posZ).sub(new THREE.Vector3(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      50,
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    )).normalize().multiplyScalar(500)

    let to = new THREE.Vector3(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      50,
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    ).add(toBlockVec)
    let toTarget = new THREE.Vector3(posX, 50, posZ)

    this.prepareCamAnim(to, toTarget)

    this.autoPilotTween = new TWEEN.Tween(this.camera.position)
      .to(to, 10000)
      .onUpdate(function () {
        if (!this.autoPilot) {
          return
        }

        this.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        setTimeout(() => {
          if (this.autoPilot) {
            this.autoPilotAnimLoop()
          }
        }, 10)
      })
      .start()

    this.animateCamRotation(5000)
  }

  animate () {
    window.requestAnimationFrame(this.animate.bind(this))
    this.renderFrame()
  }

  renderFrame () {
    this.frame++

    let delta = this.clock.getDelta()

    TWEEN.update()

    if (this.controls) {
      this.controls.update(delta)
    }

    if (this.planetMesh) {
      this.planetMesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), window.performance.now() * 0.000000005)
    }

    if (this.picker) {
      this.updatePicker()
    }

    this.getClosestBlock()

    if (this.blockReady) {
      this.loadNearestBlocks()
      this.setRenderOrder()

      this.diskGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position,
        maxHeight: this.maxHeight
      })

      // this.txGenerator.update({
      //   time: window.performance.now()
      // })

      this.undersideGenerator.update({
        time: window.performance.now()
      })

      this.particlesGenerator.update({
        time: window.performance.now(),
        deltaTime: delta,
        spawnStart: this.txSpawnStart,
        spawnDestination: this.txSpawnDestination
      })

      this.crystalGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position,
        autoPilot: this.autoPilot
      })

      // this.crystalAOGenerator.update(window.performance.now())
      this.treeGenerator.update(window.performance.now() - this.blockAnimStartTime)
    }

    this.FilmShaderPass.uniforms.time.value = window.performance.now() * 0.000001

    if (this.config.debug.debugPicker && this.pickingScene) {
      this.renderer.render(this.pickingScene, this.camera)
    } else {
      // this.renderer.render(this.scene, this.camera)
      this.composer.render()
    }
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)

    this.on('blockChanged', () => {
      this.addClosestBlockDetail()
    })

    this.resize()

    this.audio.on('loopend', (blockData) => {
      this.crystalGenerator.updateBlockStartTimes(blockData)
      // this.crystalAOGenerator.updateBlockStartTimes(blockData)
    })

    document.addEventListener('mousemove', this.onMouseMove.bind(this), false)

    document.addEventListener('mouseup', (e) => {
      if (e.target.className !== 'cockpit-border') {
        return
      }
      if (e.button !== 0) {
        return
      }
      this.onMouseUp()
    })

    document.addEventListener('mousedown', (e) => {
      this.onMouseDown()
    })

    document.addEventListener('keydown', (event) => {
      if (this.state.controlType === 'fly') {
        if (event.shiftKey) {
          if (this.controls) {
            if (this.controls.movementSpeed < 1000) {
              this.controls.movementSpeed += 10
            }
          }
        }
      }
    })

    document.addEventListener('keyup', (event) => {
      if (this.state.controlType === 'fly') {
        if (!event.shiftKey) {
          if (this.controls) {
            this.controls.movementSpeed = 100
          }
        }
      }
    })

    // bind WebSocket events
    // this.setUpWs()
  }

  sendWsMessage (message) {
    this.ws.send(JSON.stringify({'op': message}))
  }

  receiveWsMessage (event) {
    let eventData = JSON.parse(event.data)
    if (eventData.op === 'utx') {
      console.log(eventData.x)
    }
  }

  setUpWs () {
    this.ws = new WebSocket('wss://ws.blockchain.info/inv')
    // this.ws = new WebSocket('wss://socket.blockcypher.com/v1/btc/main/txs/propagation')

    this.ws.onmessage = (event) => {
      this.receiveWsMessage(event)
    }

    this.ws.onopen = (event) => {
      this.sendWsMessage('unconfirmed_sub')
    }

    // add timer to keep connection alive with ping message
    // this.keepAlive = setInterval(() => {
    //   this.sendWsMessage('ping')
    // }, 10000)
  }

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

    this.setState({
      closestBlock: this.closestBlock
    })

    this.txSpawnDestination = new THREE.Vector3(0, 0, 0)

    let posX = this.blockPositions[this.closestBlock.blockData.height * 2 + 0]
    let posZ = this.blockPositions[this.closestBlock.blockData.height * 2 + 1]

    this.updateClosestTrees()

    this.pickerGenerator.updateGeometry(this.closestBlock)

    for (const height in this.audio.audioSources) {
      if (this.audio.audioSources.hasOwnProperty(height)) {
        if (
          height < this.closestBlock.blockData.height - 5 ||
          height > this.closestBlock.blockData.height + 5
        ) {
          this.audio.audioSources[height].stop()
          delete this.audio.audioSources[height]
          delete this.audio.buffers[height]
          delete this.audio.gainNodes[height]
          console.log('stopped audio at height: ' + height)
        }

        clearTimeout(this.audio.loops[height])
      }
    }

    let indexOffset = this.planeGenerator.blockHeightIndex[this.closestBlock.blockData.height]
    this.originOffset = new THREE.Vector2(
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 0],
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 1]
    )

    this.createCubeMap(
      new THREE.Vector3(this.plane.geometry.attributes.planeOffset.array[indexOffset + 0],
        100,
        this.plane.geometry.attributes.planeOffset.array[indexOffset + 1])
    )

    if (typeof this.audio.buffers[this.closestBlock.blockData.height] === 'undefined') {
      this.audio.generate(this.closestBlock.blockData)
      this.crystalGenerator.updateBlockStartTimes(this.closestBlock.blockData)
      // this.crystalAOGenerator.updateBlockStartTimes(this.closestBlock.blockData)
    }

    let undersideTexture1 = null
    let undersideTexture2 = null
    let undersideTexture3 = null

    let prevBlock = this.blockGeoDataObject[this.closestBlock.blockData.height - 1]
    let nextBlock = this.blockGeoDataObject[this.closestBlock.blockData.height + 1]

    const nTX1 = Object.keys(this.closestBlock.blockData.tx).length
    undersideTexture1 = await this.circuit.draw(nTX1, this.closestBlock)

    if (typeof prevBlock !== 'undefined') {
      if (typeof this.audio.buffers[prevBlock.blockData.height] === 'undefined') {
        this.audio.generate(prevBlock.blockData)
        this.crystalGenerator.updateBlockStartTimes(prevBlock.blockData)
        // this.crystalAOGenerator.updateBlockStartTimes(prevBlock.blockData)
      }
      let block2 = prevBlock
      const nTX2 = Object.keys(block2.blockData.tx).length
      undersideTexture2 = await this.circuit.draw(nTX2, block2)
    }

    if (typeof nextBlock !== 'undefined') {
      if (typeof this.audio.buffers[nextBlock.blockData.height] === 'undefined') {
        this.audio.generate(nextBlock.blockData)
        this.crystalGenerator.updateBlockStartTimes(nextBlock.blockData)
        // this.crystalAOGenerator.updateBlockStartTimes(nextBlock.blockData)
      }
      let block3 = nextBlock
      const nTX3 = Object.keys(block3.blockData.tx).length
      undersideTexture3 = await this.circuit.draw(nTX3, block3)
    }

    this.planetMesh.position.x = 0
    this.planetMesh.position.z = 0
    this.planetMesh.position.x -= this.originOffset.x
    this.planetMesh.position.z -= this.originOffset.y

    this.group.position.x = this.originOffset.x
    this.group.position.z = this.originOffset.y

    this.treeGenerator.updateOriginOffset(this.originOffset)
    this.planeGenerator.updateOriginOffset(this.originOffset)
    this.occlusionGenerator.updateOriginOffset(this.originOffset)
    this.crystalGenerator.updateOriginOffset(this.originOffset)
    this.particlesGenerator.updateOriginOffset(this.originOffset)
    // this.crystalAOGenerator.updateOriginOffset(this.originOffset)
    this.diskGenerator.updateOriginOffset(this.originOffset)
    // this.txGenerator.updateOriginOffset(this.originOffset)

    if (undersideTexture1) {
      this.updateMerkleDetail(this.closestBlock, 0, undersideTexture1)
    }

    if (undersideTexture2) {
      this.updateMerkleDetail(prevBlock, 1, undersideTexture2)
    }

    if (undersideTexture3) {
      this.updateMerkleDetail(nextBlock, 2, undersideTexture3)
    }
  }

  async updateClosestTrees () {
    let centerTree = await this.treeGenerator.get(this.closestBlock.blockData)

    if (this.centerTree) {
      this.group.remove(this.centerTree)
    }
    this.centerTree = centerTree
    this.centerTree.material = this.treeGenerator.materialC
    this.centerTree.renderOrder = -1
    this.group.add(centerTree)

    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height - 1] !== 'undefined') {
      let lTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height - 1].blockData)
      if (this.lTree) {
        this.group.remove(this.lTree)
      }
      this.lTree = lTree
      this.lTree.material = this.treeGenerator.materialL
      this.lTree.renderOrder = -1
      this.group.add(this.lTree)
    }
    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height + 1] !== 'undefined') {
      let rTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height + 1].blockData)
      if (this.rTree) {
        this.rTree.material = this.treeGenerator.materialR
        this.group.remove(this.rTree)
      }
      this.rTree = rTree
      this.rTree.renderOrder = -1
      this.group.add(this.rTree)
    }

    this.trees.geometry.attributes.display.array.forEach((height, i) => {
      this.trees.geometry.attributes.display.array[i] = 1
    })

    let treeHeightIndex = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height]

    this.trees.geometry.attributes.display.array[treeHeightIndex] = 0

    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height - 1] !== 'undefined') {
      if (typeof this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height - 1] !== 'undefined') {
        treeHeightIndex = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height - 1]
        this.trees.geometry.attributes.display.array[treeHeightIndex] = 0
      }
    }

    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height + 1] !== 'undefined') {
      if (typeof this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height + 1] !== 'undefined') {
        treeHeightIndex = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height + 1]
        this.trees.geometry.attributes.display.array[treeHeightIndex] = 0
      }
    }
    this.trees.geometry.attributes.display.needsUpdate = true
  }

  async updateMerkleDetail (blockGeoData, circuitIndex, texture) {
    let undersidePlane

    switch (circuitIndex) {
      case 0:
        undersidePlane = this.underside
        break
      case 1:
        undersidePlane = this.undersideL
        break
      case 2:
        undersidePlane = this.undersideR
        break
    }

    let txIndexOffset = this.crystalGenerator.txIndexOffsets[blockGeoData.blockData.height]

    // get rotation
    let quat = new THREE.Quaternion(
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 0],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 1],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 2],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 3]
    )

    // texture.minFilter = THREE.LinearMipMapLinearFilter

    undersidePlane.material.map = texture
    undersidePlane.rotation.x = 0
    undersidePlane.rotation.y = 0
    undersidePlane.rotation.z = 0
    undersidePlane.position.x = blockGeoData.blockData.pos.x - this.originOffset.x
    undersidePlane.position.z = blockGeoData.blockData.pos.z - this.originOffset.y

    undersidePlane.applyQuaternion(quat)
    undersidePlane.rotateX(Math.PI / 2)
    undersidePlane.updateMatrix()
    undersidePlane.visible = true
  }

  initScene () {
    this.group = new THREE.Group()

    this.scene = new THREE.Scene()

    this.scene.add(this.group)

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
      100000000
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
      antialias: false,
      logarithmicDepthBuffer: true,
      canvas: this.canvas
    })
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

    if (this.pickingTexture) {
      this.pickingTexture.setSize(this.width, this.height)
    }
  }

  toggleSidebar () {
    this.setState({sidebarOpen: !this.state.sidebarOpen})
  }

  searchFocus (e) {
    e.target.focus()
  }

  async lookupTXFromHash () {
    this.audio.stopNotes()

    this.autoPilot = false
    this.autoPilotDirection = false

    this.hideMerkleDetail()

    try {
      let txData = await window.fetch('https://blockchain.info/rawtx/' + this.state.searchTXHash + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      let txDataJSON = await txData.json()

      let posX = this.blockPositions[txDataJSON.block_height * 2 + 0]
      let posZ = this.blockPositions[txDataJSON.block_height * 2 + 1]

      this.closestHeight = txDataJSON.block_height

      this.loadNearestBlocks(true, this.closestHeight)

      let to = new THREE.Vector3(posX, 10000, posZ)
      let toTarget = new THREE.Vector3(posX, 0, posZ)
      this.prepareCamAnim(
        to,
        toTarget
      )

      this.toggleSidebar()
      this.toggleTxSearch()

      let aboveStart = this.camera.position.clone()
      aboveStart.y = 1000000

      let that = this
      new TWEEN.Tween(this.camera.position)
        .to(aboveStart, 5000)
        .onUpdate(function () {
          that.camera.position.set(this.x, this.y, this.z)
        })
        .onComplete(() => {
          new TWEEN.Tween(that.camera.position)
            .to(to, 5000)
            .onUpdate(function () {
              that.camera.position.set(this.x, this.y, this.z)
            })
            .onComplete(() => {
              new TWEEN.Tween(this.camera.position)
                .to(new THREE.Vector3(that.camPosTo.x, 1000, that.camPosTo.z), 5000)
                .onUpdate(function () {
                  that.camera.position.set(this.x, this.y, this.z)
                })
                .onComplete(() => {
                  if (this.state.searchTXHash) {
                    let foundTXID = 0

                    this.closestBlock.blockData.tx.forEach((el, i) => {
                      if (el.hash === this.state.searchTXHash) {
                        foundTXID = i
                      }
                    })

                    this.selectTX(foundTXID, this.state.searchTXHash)
                  }
                })
                .easing(this.defaultCamEasing)
                .start()
            })
            .easing(this.defaultCamEasing)
            .start()
        })
        .easing(this.defaultCamEasing)
        .start()

      this.animateCamRotation(10000)
    } catch (error) {

    }
  }

  animateCamRotation (duration) {
    let o = {t: 0}
    this.cameraRotationTween = new TWEEN.Tween(o)
      .to({t: 1}, duration)
      .onUpdate(function () {
        THREE.Quaternion.slerp(this.camFromQuaternion, this.camToQuaternion, this.camMoveQuaternion, o.t)
        this.camera.quaternion.set(this.camMoveQuaternion.x, this.camMoveQuaternion.y, this.camMoveQuaternion.z, this.camMoveQuaternion.w)
      }.bind(this))
      .easing(this.defaultCamEasing)
      .start()
  }

  updateSearchTXHash (e) {
    let txHash = e.target.value.trim()
    if (txHash) {
      this.setState({searchTXHash: txHash})
    }
  }

  updateSearchBlockHash (e) {
    let blockHash = e.target.value.trim()
    if (blockHash) {
      this.setState({searchBlockHash: blockHash})
    }
  }

  async lookupBlockFromHash () {
    this.audio.stopNotes()

    this.autoPilot = false
    this.autoPilotDirection = false

    this.hideMerkleDetail()

    let blockData = await window.fetch('https://blockchain.info/rawblock/' + this.state.searchBlockHash + '?cors=true&apiCode=' + this.config.blockchainInfo.apiCode)

    let blockDataJSON = await blockData.json()

    this.toggleSidebar()

    this.toggleBlockSearch()

    let posX = this.blockPositions[blockDataJSON.height * 2 + 0]
    let posZ = this.blockPositions[blockDataJSON.height * 2 + 1]

    this.closestHeight = blockDataJSON.height

    this.loadNearestBlocks(true, this.closestHeight)

    let to = new THREE.Vector3(posX, 1000000, posZ)
    let toTarget = new THREE.Vector3(posX, 0, posZ)

    this.prepareCamAnim(to, toTarget)

    let aboveStart = this.camera.position.clone()
    aboveStart.y = 1000000

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(aboveStart, 5000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        new TWEEN.Tween(that.camera.position)
          .to(to, 5000)
          .onUpdate(function () {
            that.camera.position.set(this.x, this.y, this.z)
          })
          .onComplete(() => {
            new TWEEN.Tween(this.camera.position)
              .to(new THREE.Vector3(to.x, 500, to.z), 5000)
              .onUpdate(function () {
                that.camera.position.set(this.x, this.y, this.z)
              })
              .onComplete(() => {
                this.toggleMapControls(true, toTarget)
                this.animatingCamera = false
              })
              .easing(this.defaultCamEasing)
              .start()
          })
          .easing(this.defaultCamEasing)
          .start()
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(10000)
  }

  UISidebar () {
    let sidebarClassName = 'sidebar'

    if (this.state.sidebarOpen) {
      sidebarClassName += ' open'
    } else {
      sidebarClassName += ' closed'
    }

    return (
      <div className={sidebarClassName}>
        <button className='expand' onClick={this.toggleSidebar.bind(this)} />
        <h1>Symphony</h1>
        <h2>Interactive Blockchain Map</h2>
        <div className='section key'>
          <h3>Transaction Value</h3>
          <div className='sidebar-show'><img src={txSingle} /></div>
          <div className='sidebar-hide'><img src={txValueKey} /></div>
          <h3>Spending</h3>
          <div className='sidebar-hide'>
              <span className='spending-key'><img src={txSpent} /> <span>Spent</span></span>
              <span className='spending-key'><img src={txUnspent} /> <span>Unspent</span></span>
          </div>
        </div>
        <div className='section explore'>
          <h3>Explore</h3>
          <ul>
            <li>
              <button className='search' onClick={this.toggleSidebar.bind(this)} />
              <span onClick={this.toggleBlockSearch.bind(this)}>Locate Block</span>
              <span onClick={this.toggleTxSearch.bind(this)}>Locate Transaction</span>
              <span onClick={this.goToRandomBlock.bind(this)}>Random Block</span>
            </li>
          </ul>
        </div>
        <div className='sidebar-footer'>
        <div className='sidebar-footer-inner'>
          <span className='iohk-supported'>IOHK Supported Project</span>
          <img className='iohk-logo' src={iohkLogo} />
        </div>
        </div>
      </div>
    )
  }

  UITXSearchBox () {
    if (this.state.txSearchOpen) {
      return (
        <div className='search-container'>
          <h2>Enter Transaction Hash</h2>
          <button className='search-box-close' onClick={this.toggleTxSearch.bind(this)}>X</button>
          <input className='search-box' onChange={this.updateSearchTXHash.bind(this)} onClick={(e) => { this.searchFocus(e) }} />
          <button className='search-action' onClick={this.lookupTXFromHash.bind(this)} />
        </div>
      )
    }
  }

  UIBlockSearchBox () {
    if (this.state.blockSearchOpen) {
      return (
        <div className='search-container'>
          <h2>Enter Block Hash</h2>
          <button className='search-box-close' onClick={this.toggleBlockSearch.bind(this)}>X</button>
          <input className='search-box' onChange={this.updateSearchBlockHash.bind(this)} onClick={(e) => { this.searchFocus(e) }} />
          <button className='search-action' onClick={this.lookupBlockFromHash.bind(this)} />
        </div>
      )
    }
  }

  UICockpit () {
    if (this.state.controlType === 'fly') {
      return (
        <div>
          <div className='crosshair' />
        </div>
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
          {this.UICockpit()}
          {this.UICockpitButton()}

          <div className='controls-container'>
            <div className='auto-pilot-controls'>
              <span title='Auto Pilot backwards in time' className='backward' onClick={() => this.toggleAutoPilotDirection('backward')} />
              <span title='Stop Auto Pilot' className='stop' onClick={() => this.stopAutoPilot()} />
              <span title='Auto Pilot forwards in time' className='forward' onClick={() => this.toggleAutoPilotDirection('forward')} />
            </div>
            {this.UIUndersideButton()}
          </div>

          {this.UITXDetails()}

          <div className='blockchain-selector'>
            <img src={bitcoinLogo} />
            <span>Bitcoin Blockchain</span>
            <img className='down-arrow' src={downArrow} />
          </div>

          <div className='block-details'>
            <span className='line' />
            <span className='dot' />
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

  UICockpitButton () {
    if (this.state.controlType === 'fly') {
      return (
        <button title='Toggle Cockpit Controls' onClick={this.toggleTopView.bind(this)} className='toggle-cockpit-controls enter' />
      )
    } else {
      return (
        <button title='Toggle Cockpit Controls' onClick={this.toggleFlyControls.bind(this)} className='toggle-cockpit-controls leave' />
      )
    }
  }

  UIUndersideButton () {
    if (this.state.controlType !== 'underside') {
      return (
        <div className='flip-view-container'>
          <button title='Show Merkle Tree' onClick={this.toggleUndersideView.bind(this)} className='flip-view' />
        </div>
      )
    } else {
      return (
        <div className='flip-view-container'>
          <button title='Show Block Top' onClick={this.toggleTopView.bind(this)} className='flip-view' />
        </div>
      )
    }
  }

  UITXDetails () {
    if (this.state.txSelected) {
      return (
        <div className='tx-details'>
          <span className='border-left' />
          <div className='tx-details-inner'>
            <img src={crystalImage} />
            <h2>Transaction</h2>
            <ul>
              <li><h3>Date</h3> <strong>{ moment.unix(this.state.txSelected.time).format('MM.DD.YY HH:mm:ss') }</strong></li>
              <li title={this.state.txSelected.hash}><h3>Hash</h3> <strong>{this.state.txSelected.hash.substring(0, 16)}...</strong></li>
              <li><h3>Version</h3> <strong>{this.state.txSelected.ver}</strong></li>
              <li><h3>Size (bytes)</h3> <strong>{this.state.txSelected.size}</strong></li>
              <li><h3>Relayed By</h3> <strong>{this.state.txSelected.relayed_by}</strong></li>
              <li><h3>Outputs Spent</h3> <strong>{(this.state.txSelected.spentRatio * 100).toFixed(0)}%</strong></li>
              <li><h3>Input Total</h3> <strong>{this.state.txSelected.inTotal} BTC</strong></li>
              <li><h3>Output Total</h3> <strong>{this.state.txSelected.outTotal} BTC</strong></li>
              <li><h3>Fee</h3> <strong>{this.state.txSelected.fee} BTC</strong></li>
              <li><h3><strong><a target='_blank' href={'https://www.blockchain.com/btc/tx/' + this.state.txSelected.hash}>View Details</a></strong></h3></li>
            </ul>
          </div>
          <span className='border-right' />
        </div>
      )
    }
  }

  UI () {
    return (
      <div className='symphony-ui'>
        {this.UISidebar()}
        {this.UITXSearchBox()}
        {this.UIBlockSearchBox()}
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
