// libs
import React, { Component } from 'react'
import * as THREE from 'three'
import deepAssign from 'deep-assign'
import EventEmitter from 'eventemitter3'
import mixin from 'mixin'
import firebase from 'firebase/app'
import 'firebase/firestore'
// import 'firebase/auth'
import 'firebase/storage'
import moment from 'moment'
import { map } from './utils/math'
import FlyControls from './libs/FlyControls'
import MapControls from './libs/MapControls'
import AudioManager from './libs/audio/audioManager'
import Circuit from './libs/circuit'
import * as dat from 'dat.gui'
import TWEEN from 'tween.js'
import WebVR from './libs/WebVR'
import OBJLoader from './libs/OBJLoader'
import ViveController from './libs/ViveController'
import * as ArrayUtils from './utils/array'

// Components
import BlockDetails from './components/BlockDetails/BlockDetails'
import WebVRButton from './components/WebVRButton/WebVRButton'
import Sidebar from './components/Sidebar/Sidebar'

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
  SMAAPass,
  SSAARenderPass
} from './libs/post/EffectComposer'

// import CopyShader from './libs/post/CopyShader'
import HueSaturation from './libs/post/HueSaturation'
import BrightnessContrast from './libs/post/BrightnessContrast'
import VignetteShader from './libs/post/Vignette'
import FilmShader from './libs/post/Film'

// Config
import Config from './Config'

// Geometry
import Crystal from './geometry/crystal/Crystal'
import Picker from './geometry/picker/Picker'
import CrystalAO from './geometry/crystalAO/CrystalAO'
import Plane from './geometry/plane/Plane'
import Occlusion from './geometry/occlusion/Occlusion'
import Tree from './geometry/tree/Tree'
import Disk from './geometry/disk/Disk'
import Bg from './geometry/bg/Bg'
import Glow from './geometry/glow/Glow'
import Tx from './geometry/tx/Tx'
import Underside from './geometry/underside/Underside'
import Particles from './geometry/particles/Particles'
import Text from './geometry/text/Text'

// CSS
import './App.css'

// Images
import logo from './assets/images/logo-square.png'

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
    this.loadingNearestBlocks = false
    this.blockGeoDataObject = {}
    this.blockPositions = null
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.undersideL = null
    this.undersideR = null
    this.closestBlockReadyForUpdate = false
    this.clock = new THREE.Clock()
    this.loadedBaseGeoHeights = []
    this.mousePos = new THREE.Vector2() // keep track of mouse position
    this.lastMousePos = new THREE.Vector2()
    this.camera = null
    this.cameraMain = null
    this.animatingCamera = false
    this.camPosTo = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camPosToTarget = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromPosition = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromRotation = new THREE.Vector3(0.0, 0.0, 0.0)
    this.defaultCamEasing = TWEEN.Easing.Quadratic.InOut
    this.autoPilot = false
    this.autoPilotDirection = false
    this.mapControlsYPos = 500
    this.closestHeight = null
    this.originOffset = new THREE.Vector2(0, 0)
    this.txCountBufferSize = 4000 // buffer size for tx counts
    this.autoPilotYPos = 20
    this.boundingBoxObj = null
    this.OBJLoader = new OBJLoader()
    this.textureLoader = new THREE.TextureLoader()
    this.maxHeight = null
    this.isNavigating = false

    // VR
    this.blockHeightTextMesh = null
    this.blockDetailsTextMesh = null
    this.txDetailsTextMesh = null
    this.WebVRLib = new WebVR() // WebVR lib
    this.vrActive = false
    this.viveController1 = null
    this.controllerCam = null
    this.viveController2 = null
    this.viveController1Buttons = new ViveController(0)
    this.viveController2Buttons = new ViveController(1)
    this.viveTriggerPressed1 = false
    this.viveTriggerPressed2 = false
    this.viveController1MeshGroup = new THREE.Group()
    this.viveController2MeshGroup = new THREE.Group()
    this.chapters = {
      1: {
        title: 'THE GENESIS BLOCK',
        height: 0
      },
      2: {
        title: '"BITCOIN PIZZA DAY"',
        height: 57043
      },
      3: {
        title: 'THE MERKLE TREE',
        height: 300000
      },
      4: {
        title: 'NETWORK CONGESTION',
        height: 502117
      },
      5: {
        title: 'CURRENT DAY',
        height: this.maxHeight
      },
      6: {
        title: 'MEMPOOL'
      },
      7: {
        title: 'END'
      }
    }

    this.state = {
      loading: true,
      closestBlock: null,
      controlType: 'map',
      txSelected: null,
      sidebarOpen: false,
      txSearchOpen: false,
      blockSearchOpen: false,
      dateSearchOpen: false,
      searchTXHash: '',
      searchBlockHash: '',
      showIntro: false,
      posX: 0,
      posY: 0,
      posZ: 0,
      sceneReady: false,
      started: false // if the experience has started
    }

    this.setTimestampToLoad()
    this.setBlockHashToLoad()
    this.setHeightToLoad()
  }

  componentDidMount () {
    this.initStage()
  }

  async initStage () {
    this.initFirebase()

    this.initRenderer()

    this.circuit = new Circuit({FBStorageCircuitRef: this.FBStorageCircuitRef, config: this.config})
    this.audioManager = new AudioManager({
      sampleRate: this.config.audio.sampleRate,
      soundDuration: this.config.audio.soundDuration,
      noteDuration: this.config.audio.noteDuration,
      config: this.config
    })

    this.crystalGenerator = new Crystal({
      planeSize: this.planeSize,
      config: this.config
    })

    this.pickerGenerator = new Picker({
      planeSize: this.planeSize,
      config: this.config
    })

    this.crystalAOGenerator = new CrystalAO({
      planeSize: this.planeSize,
      config: this.config
    })

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

    this.txGenerator = new Tx({
      config: this.config
    })

    this.particlesGenerator = new Particles({
      config: this.config
    })

    this.diskGenerator = new Disk({
      config: this.config
    })

    this.glowGenerator = new Glow({
      config: this.config
    })

    this.bgGenerator = new Bg({
      config: this.config
    })

    this.heightsToLoad = []
    this.loadingMutex = []

    this.initGUI()

    this.textGenerator = new Text({
      config: this.config,
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy()
    })

    this.initScene()
    this.initCamera()
    this.initPost()
    this.initLights()
    await this.initPositions()
    this.initEnvironment()
    this.initGeometry()
    this.addEvents()

    // this.animate()

    this.renderer.setAnimationLoop(function () {
      this.renderFrame()
    }.bind(this))
  }

  enableVR () {
    this.renderer.vr.enabled = true
  }

  /**
   * Switch renderOrder of elements based on camera position
   */
  setRenderOrder () {
    this.txs.renderOrder = 0
    this.particles.renderOrder = 0
    this.glow.renderOrder = 0

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

      this.occlusion.renderOrder = 1

      this.crystal.renderOrder = 2
      this.trees.renderOrder = 1
      this.disk.renderOrder = 3
      this.plane.renderOrder = 4
      this.crystalAO.renderOrder = 7

      this.underside.position.y = -3.1
      this.undersideL.position.y = -3.1
      this.undersideR.position.y = -3.1

      this.underside.renderOrder = 3
      this.undersideL.renderOrder = 3
      this.undersideR.renderOrder = 3
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

      this.occlusion.renderOrder = 11

      this.underside.position.y = -3.1
      this.undersideL.position.y = -3.1
      this.undersideR.position.y = -3.1

      this.crystal.renderOrder = 2
      this.crystalAO.renderOrder = 3
      this.plane.renderOrder = 4
      this.underside.renderOrder = 5
      this.undersideL.renderOrder = 5
      this.undersideR.renderOrder = 5
      this.trees.renderOrder = 6
      this.disk.renderOrder = 7
    }

    this.bg.renderOrder = 0
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
    if (this.WebVRLib.VRSupported) {
      this.renderer.vr.enabled = true
    }

    if (this.renderer.vr.enabled) {
      this.renderer.vr.enabled = false
    }

    if (this.vrActive && this.controllerCam) {
      this.renderer.setRenderTarget(this.pickingTexture)
      this.renderer.render(this.pickingScene, this.controllerCam)
    } else {
      this.renderer.setRenderTarget(this.pickingTexture)
      this.renderer.render(this.pickingScene, this.cameraMain)
    }

    let pixelBuffer = new Uint8Array(4)

    let canvasOffset = this.renderer.domElement.getBoundingClientRect()

    if (this.vrActive) {
      this.renderer.readRenderTargetPixels(
        this.pickingTexture,
        this.pickingTexture.width / 2,
        this.pickingTexture.height / 2,
        1,
        1,
        pixelBuffer
      )
    } else {
      this.renderer.readRenderTargetPixels(
        this.pickingTexture,
        this.mousePos.x - canvasOffset.left,
        this.pickingTexture.height - (this.mousePos.y - canvasOffset.top),
        1,
        1,
        pixelBuffer
      )
    }

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

        this.txIsHovered = false
        document.body.style.cursor = 'default'
      }

      // update isHovered attribute
      let hoveredArray = new Float32Array(this.crystalGenerator.instanceTotal)
      if (this.lastHoveredID !== -1) {
        const txIndexOffset = this.crystalGenerator.txIndexOffsets[this.closestBlock.blockData.height]
        hoveredArray[this.lastHoveredID + txIndexOffset] = 1.0
      }
      this.crystal.geometry.attributes.isHovered.array = hoveredArray
      this.crystal.geometry.attributes.isHovered.needsUpdate = true
    }
  }

  async selectTX (index, TXHash, animateCam) {
    this.emit('txSelect', {
      txData: TXHash,
      mousePos: this.mousePos
    })

    // this.audioManager.playNote(this.closestBlock.blockData, index + 1)

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

      this.addTXDetailsVRText(txDataJSON)

      if (animateCam) {
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
      }

      selectedArray[index + txIndexOffset] = 1.0
    }

    this.crystal.geometry.attributes.isSelected.array = selectedArray
    this.crystal.geometry.attributes.isSelected.needsUpdate = true
  }

  deselectTx () {
    this.lastSelectedID = -1
    this.emit('txDeselect', {})

    this.audioManager.stopNotes()

    this.cameraMain.remove(this.txDetailsTextMesh)

    this.setState({
      txSelected: null
    })

    if (this.selectedLight) {
      this.selectedLight.position.x = -999999
      this.selectedLight.position.z = -999999
    }

    // update isSelected attribute
    if (this.crystal) {
      let selectedArray = new Float32Array(this.crystalGenerator.instanceTotal)
      this.crystal.geometry.attributes.isSelected.array = selectedArray
      this.crystal.geometry.attributes.isSelected.needsUpdate = true
    }
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
      this.deselectTx()
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
        this.deselectTx()
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
    this.timestampToLoad = moment().valueOf() // default to today's date

    if (typeof URLSearchParams !== 'undefined') {
      // get date from URL
      let urlParams = new URLSearchParams(window.location.search)
      if (urlParams.has('date')) {
        this.timestampToLoad = moment(urlParams.get('date')).valueOf()
      }
    }
  }

  initPost () {
    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(this.scene, this.cameraMain)
    this.composer.addPass(this.renderPass)

    this.setPostSettings()
  }

  setPostSettings () {
    this.ssaaRenderPass = new SSAARenderPass(this.scene, this.cameraMain)
    this.ssaaRenderPass.unbiased = true
    this.composer.addPass(this.ssaaRenderPass)

    this.HueSaturationPass = new ShaderPass(HueSaturation)
    this.composer.addPass(this.HueSaturationPass)

    this.BrightnessContrastPass = new ShaderPass(BrightnessContrast)
    this.composer.addPass(this.BrightnessContrastPass)

    // res, strength, radius, threshold
    // this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 2.5, 0.4)

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.3, 0.4) // 1.0, 9, 0.5, 512);

    this.composer.addPass(this.bloomPass)

    this.VignettePass = new ShaderPass(VignetteShader)
    // this.VignettePass.renderToScreen = true
    this.composer.addPass(this.VignettePass)

    this.FilmShaderPass = new ShaderPass(FilmShader)
    this.FilmShaderPass.renderToScreen = true
    this.composer.addPass(this.FilmShaderPass)

    // this.copyPass = new ShaderPass(CopyShader)
    // this.copyPass.renderToScreen = true
    // this.composer.addPass(this.copyPass)

    // this.SMAAPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio())
    // this.SMAAPass.renderToScreen = true
    // this.composer.addPass(this.SMAAPass)
  }

  initFirebase () {
    try {
      firebase.initializeApp(this.config.fireBase)

      firebase.firestore().enablePersistence()
      this.FBStorage = firebase.storage()
      this.FBStorageRef = this.FBStorage.ref()

      this.FBStorageCircuitRef = this.FBStorageRef.child('bitcoin_circuits')
      this.FBStorageAudioRef = this.FBStorageRef.child('bitcoin_block_audio')

      // await firebase.firestore().enablePersistence()
    } catch (error) {
      console.log(error)
    }

    this.firebaseDB = firebase.firestore()

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
  async getBlockData (hash, heightToLoad) {
    return new Promise(async (resolve, reject) => {
      const getBlockDataWorker = new GetBlockDataWorker()
      getBlockDataWorker.onmessage = ({ data }) => {
        if (data.blockData) {
          data.blockData.txValues = data.txValues
          data.blockData.txSpentRatios = data.txSpentRatios
          data.blockData.txIndexes = data.txIndexes

          getBlockDataWorker.terminate()
          resolve(data.blockData)
        }
      }

      let sendObj = {
        cmd: 'get',
        heightToLoad: heightToLoad,
        hash: hash,
        config: this.config,
        maxHeight: this.maxHeight,
        txValues: new Float32Array(this.txCountBufferSize),
        txSpentRatios: new Float32Array(this.txCountBufferSize),
        txIndexes: new Uint32Array(this.txCountBufferSize)
      }

      getBlockDataWorker.postMessage(sendObj, [
        sendObj.txValues.buffer,
        sendObj.txSpentRatios.buffer,
        sendObj.txIndexes.buffer
      ])
    })
  }

  initLights () {
    // this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0)
    this.sunLight = new THREE.PointLight(0xb1cdff, 2.0)
    this.sunLight.position.set(0, 5000, 0)
    this.scene.add(this.sunLight)

    this.selectedLight = new THREE.PointLight(0xffffff, 0.1, 500.0)
    this.selectedLight.position.set(-999999, 20, -999999)
    this.group.add(this.selectedLight)
  }

  async getGeometry (hash, heightToLoad) {
    return new Promise(async (resolve, reject) => {
      let blockData = await this.getBlockData(hash, heightToLoad)

      const getGeometryWorker = new GetGeometryWorker()

      getGeometryWorker.onmessage = ({ data }) => {
        if (data.blockGeoData) {
          let blockGeoData = data.blockGeoData

          const height = parseInt(blockData.height, 10)

          blockData.pos = {
            x: this.blockPositions[height * 2 + 0],
            z: this.blockPositions[height * 2 + 1]
          }

          blockGeoData.scales = data.scales
          blockGeoData.offsets = data.offsets
          blockGeoData.blockData = blockData

          this.blockGeoDataObject[height] = {}
          this.blockGeoDataObject[height].blockData = {
            bits: blockGeoData.blockData.bits,
            block_index: blockGeoData.blockData.block_index,
            fee: blockGeoData.blockData.fee,
            hash: blockGeoData.blockData.hash,
            healthRatio: blockGeoData.blockData.healthRatio,
            height: blockGeoData.blockData.height,
            main_chain: blockGeoData.blockData.main_chain,
            mrkl_root: blockGeoData.blockData.mrkl_root,
            n_tx: blockGeoData.blockData.n_tx,
            next_block: blockGeoData.blockData.next_block,
            nonce: blockGeoData.blockData.nonce,
            outputTotal: blockGeoData.blockData.outputTotal,
            pos: blockGeoData.blockData.pos,
            prev_block: blockGeoData.blockData.prev_block,
            received_time: blockGeoData.blockData.received_time,
            relayed_by: blockGeoData.blockData.relayed_by,
            size: blockGeoData.blockData.size,
            time: blockGeoData.blockData.time,
            ver: blockGeoData.blockData.ver,
            txIndexes: blockGeoData.blockData.txIndexes
          }

          getGeometryWorker.terminate()

          resolve(blockGeoData)
        }
      }

      let sendObj = {
        cmd: 'get',
        config: this.config,
        blockData: blockData,
        planeSize: this.planeSize,
        scales: new Float32Array(this.txCountBufferSize),
        offsets: new Float32Array(this.txCountBufferSize * 2)
      }

      getGeometryWorker.postMessage(sendObj, [
        sendObj.scales.buffer,
        sendObj.offsets.buffer
      ])
    })
  }

  async initEnvironment () {
    this.disk = await this.diskGenerator.init()
    this.group.add(this.disk)

    this.glow = await this.glowGenerator.init()
    this.scene.add(this.glow)

    this.bg = await this.bgGenerator.init()
    this.scene.add(this.bg)
  }

  async initPositions () {
    let timestampToLoad = moment().valueOf() // default to today's date

    this.maxHeight = 566610

    // try {
    //   let latestBlockData = await window.fetch('https://blockchain.info/blocks/' + timestampToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    //   let latestBlockDataJSON = await latestBlockData.json()
    //   this.maxHeight = latestBlockDataJSON.blocks[0].height
    // } catch (error) {
    //   console.log(error)
    // }

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

      try {
        let blockData = await window.fetch(url, {headers: { 'X-Requested-With': 'XMLHttpRequest' }})
        let blockDataJSON = await blockData.json()
        this.blockHashToLoad = blockDataJSON.blocks[0].hash
        this.blockHeightToLoad = blockDataJSON.blocks[0].height
      } catch (error) {
        console.log(error)

        if (this.heightToLoad !== null) {
          console.log('Retrying from different endpoint...')
          url = 'https://cors-anywhere.herokuapp.com/https://blockchain.info/block-height/' + this.heightToLoad + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode

          try {
            let blockData = await window.fetch(url, {headers: { 'X-Requested-With': 'XMLHttpRequest' }})
            let blockDataJSON = await blockData.json()
            this.blockHashToLoad = blockDataJSON.blocks[0].hash
            this.blockHeightToLoad = blockDataJSON.blocks[0].height
          } catch (error) {
            console.log(error)
          }
        }
      }
    }

    this.blockHashToLoad = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'

    let blockGeoData = await this.getGeometry(this.blockHashToLoad, 0)

    this.closestHeight = blockGeoData.blockData.height

    this.crystal = await this.crystalGenerator.init(blockGeoData)
    this.group.add(this.crystal)

    this.initPicker()
    this.picker = await this.pickerGenerator.init(blockGeoData)
    this.pickingScene.add(this.picker)

    this.crystalAO = await this.crystalAOGenerator.init(blockGeoData)
    this.crystalAO.translateY(0.1)
    this.group.add(this.crystalAO)

    this.txs = await this.txGenerator.init({
      blockPositions: this.blockPositions,
      renderer: this.renderer,
      txHeights: []
    })
    this.group.add(this.txs)

    this.trees = await this.treeGenerator.init(blockGeoData)
    this.group.add(this.trees)

    this.plane = await this.planeGenerator.init(blockGeoData)
    this.group.add(this.plane)

    this.occlusion = await this.occlusionGenerator.init(blockGeoData)
    this.group.add(this.occlusion)

    this.particles = await this.particlesGenerator.init({
      blockGeoData: blockGeoData,
      renderer: this.renderer
    })
    this.scene.add(this.particles)

    this.closestBlockReadyForUpdate = true

    let undersideGroup = await this.undersideGenerator.init()

    this.underside = undersideGroup.underside
    this.undersideL = undersideGroup.undersideL
    this.undersideR = undersideGroup.undersideR

    this.group.add(this.underside)
    this.group.add(this.undersideL)
    this.group.add(this.undersideR)

    // box occluder
    let planeX = this.plane.geometry.attributes.planeOffset.array[0]
    let planeZ = this.plane.geometry.attributes.planeOffset.array[1]
    let quat = new THREE.Quaternion(
      this.plane.geometry.attributes.quaternion.array[0],
      this.plane.geometry.attributes.quaternion.array[1],
      this.plane.geometry.attributes.quaternion.array[2],
      this.plane.geometry.attributes.quaternion.array[3]
    )

    let boxGeo = new THREE.BoxGeometry(this.planeSize + 15, this.planeSize + 15, 10)
    this.boundingBoxObj = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
      colorWrite: false
    }))

    this.boundingBoxObj.visible = false

    this.boundingBoxObj.position.y = -2.5
    this.boundingBoxObj.frustumCulled = false
    this.boundingBoxObj.position.x = planeX
    this.boundingBoxObj.position.z = planeZ
    this.boundingBoxObj.applyQuaternion(quat)
    this.boundingBoxObj.rotateX(Math.PI / 2)
    this.boundingBoxObj.updateMatrix()
    this.boundingBoxObj.updateMatrixWorld()
    this.boundingBoxObj.geometry.computeBoundingBox()
    this.boundingBoxObj.updateMatrixWorld(true)

    this.boxMatrixInverse = new THREE.Matrix4().getInverse(this.boundingBoxObj.matrixWorld)
    let inverseBox = this.boundingBoxObj.clone()
    inverseBox.applyMatrix(this.boxMatrixInverse)
    this.boundingBox = new THREE.Box3().setFromObject(inverseBox)

    this.on('controlsEnabled', () => {
      this.controls.updateClosestBlockBBox(this.boundingBox, this.boxMatrixInverse)
    })

    this.scene.add(this.boundingBoxObj)

    this.blockReady = true

    this.setState({
      loading: false
    })

    this.emit('sceneReady')

    // this.unconfirmedLoop()
    this.offlineUnconfirmedLoop()

    return true
  }

  async offlineUnconfirmedLoop () {
    let txHeights = []

    for (let height = this.maxHeight - 50; height < this.maxHeight; height++) {
      if (Math.random() > 0.85) {
        txHeights.push(height)
      }
    }

    for (let height = this.maxHeight - 200; height < this.maxHeight; height++) {
      if (Math.random() > 0.96) {
        txHeights.push(height)
      }
    }

    for (let height = this.maxHeight - 10000; height < this.maxHeight - 1000; height++) {
      if (Math.random() > 0.996) {
        txHeights.push(height)
      }
    }

    txHeights.push(Math.floor(Math.random() * this.maxHeight))
    txHeights.push(Math.floor(Math.random() * this.maxHeight))
    txHeights.push(Math.floor(Math.random() * this.maxHeight))

    await this.txGenerator.updateGeometry({
      blockPositions: this.blockPositions,
      renderer: this.renderer,
      txHeights: txHeights
    })

    setTimeout(() => {
      this.offlineUnconfirmedLoop()
    }, 5000)
  }

  async unconfirmedLoop () {
    await this.getUnconfirmed()
    this.unconfirmedLoop()
  }

  getUnconfirmed () {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        let txData = await window.fetch('https://blockchain.info/unconfirmed-transactions?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
        let txDataJSON = await txData.json()

        let txHeights = []
        await ArrayUtils.asyncForEach(txDataJSON.txs, async (tx) => {
          await ArrayUtils.asyncForEach(tx.inputs, (input) => {
            return new Promise(async (resolve, reject) => {
              let inputData = await window.fetch('https://blockchain.info/rawtx/' + input.prev_out.tx_index + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
              let inputDataJSON = await inputData.json()
              txHeights.push(inputDataJSON.block_height)
              resolve()
            })
          })
        })

        await this.txGenerator.updateGeometry({
          blockPositions: this.blockPositions,
          renderer: this.renderer,
          txHeights: txHeights
        })

        resolve()
      }, 10000)
    })
  }

  createCubeMap (pos) {
    // console.time('cubemap')
    this.scene.background = this.crystalGenerator.cubeMap

    this.cubeCamera = new THREE.CubeCamera(1, 1500, 256)

    this.cubeCamera.position.copy(pos)

    if (this.renderer.vr.enabled) {
      this.renderer.vr.enabled = false
    }

    this.cubeCamera.update(this.renderer, this.scene)

    this.crystal.material.envMap = this.cubeCamera.renderTarget.texture
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
          this.camera.position.y = this.mapControlsYPos
          this.camera.position.z = target.z
        } else {
          this.controls.target = new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
          this.camera.position.x = this.closestBlock.blockData.pos.x
          this.camera.position.y = this.mapControlsYPos
          this.camera.position.z = this.closestBlock.blockData.pos.z
        }
      }
    }
  }

  stopAutoPilotAnimation () {
    if (typeof this.autoPilotTween !== 'undefined') {
      this.autoPilotTween.stop()
    }

    if (typeof this.cameraMainRotationTween !== 'undefined') {
      this.cameraMainRotationTween.stop()
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
        this.controls = new MapControls(this.cameraMain)
        this.controls.domElement = this.renderer.domElement
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.25
        this.controls.screenSpacePanning = true
        this.controls.minDistance = 0
        // this.controls.maxDistance = 3000
        this.controls.maxDistance = 300000
        this.controls.maxPolarAngle = Math.PI / 2
        this.controls.rotateSpeed = 0.05
        this.controls.panSpeed = 0.25
        this.controls.zoomSpeed = 0.5

        break

      case 'fly':
        this.controls = new FlyControls(this.cameraMain)
        this.controls.movementSpeed = 70
        this.controls.domElement = this.renderer.domElement
        this.controls.rollSpeed = Math.PI / 24
        this.controls.autoForward = false
        this.controls.dragToLook = false

        this.deselectTx()

        break

      default:
        break
    }

    this.emit('controlsEnabled')

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

    if (toTarget) {
      this.camera.lookAt(this.camPosTarget)
    } else {
      this.camera.lookAt(new THREE.Vector3(0, 0, 0))
      if (!this.vrActive) { // point camera down at block if not in VR
        this.camera.rotateX(-(Math.PI / 2))
      }
    }

    this.camToRotation = new THREE.Euler().copy(this.camera.rotation)

    // reset original position and rotation
    this.camera.position.set(this.camFromPosition.x, this.camFromPosition.y, this.camFromPosition.z)
    this.camera.rotation.set(this.camFromRotation.x, this.camFromRotation.y, this.camFromRotation.z)

    // rotate with slerp
    this.camFromQuaternion = new THREE.Quaternion().copy(this.camera.quaternion)
    this.camToQuaternion = new THREE.Quaternion().setFromEuler(this.camToRotation)
    this.camMoveQuaternion = new THREE.Quaternion()
  }

  toggleTopView () {
    if (this.isNavigating) {
      return
    }

    this.stopAutoPilotAnimation()

    let yPos = this.mapControlsYPos
    if (this.vrActive) {
      yPos = 20
    }

    this.prepareCamAnim(
      new THREE.Vector3(this.closestBlock.blockData.pos.x, yPos, this.closestBlock.blockData.pos.z),
      new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
    )

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(this.camPosTo, 6000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        if (!this.vrActive) {
          this.toggleMapControls()
          this.controls.target = this.camPosTarget
        }
      })
      .easing(this.defaultCamEasing)
      .start()

    // this.animateCamRotation(5000)
  }

  async toggleUndersideView () {
    if (this.isNavigating) {
      return
    }

    this.stopAutoPilotAnimation()

    let to = new THREE.Vector3(this.closestBlock.blockData.pos.x - 100, -300, this.closestBlock.blockData.pos.z - 100)
    let toTarget = new THREE.Vector3(this.closestBlock.blockData.pos.x - 90, 0, this.closestBlock.blockData.pos.z - 90)

    this.prepareCamAnim(
      to,
      toTarget
    )

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(this.camPosTo, 6000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        that.toggleUndersideControls()
        that.controls.target = that.camPosTarget
      })
      .easing(this.defaultCamEasing)
      .start()

    // this.animateCamRotation(5000)
  }

  getClosestBlock () {
    if (this.camera.position.y >= 2000) {
      if (this.state.closestBlock !== null) {
        this.setState({closestBlock: null})
      }
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

          if (typeof this.audioManager.gainNodes[height] !== 'undefined') {
            let vol = map((blockDist * 0.001), 0, 100, 0.5, 0.0)
            if (vol < 0 || !isFinite(vol)) {
              vol = 0
            }
            this.audioManager.gainNodes[height].gain.value = vol
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
    if (this.loadingNearestBlocks) {
      return
    }

    if (!ignoreCamPos) {
      if (this.camera.position.y > 20000) {
        this.loadingNearestBlocks = false
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
      this.loadingNearestBlocks = false
      return
    }

    this.loadingNearestBlocks = true

    this.lastLoadPos = {
      x: this.camera.position.x,
      z: this.camera.position.z
    }

    if (closestHeight !== null) {
      this.closestHeight = closestHeight
    } else {
      let closestDist = Number.MAX_SAFE_INTEGER

      let camVec = new THREE.Vector2(this.camera.position.x, this.camera.position.z)

      let start = this.closestHeight - 5
      let end = this.closestHeight + 5

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

    this.loadedBaseGeoHeights.forEach((height, i) => {
      if (
        height < this.closestHeight - 100 ||
          height > this.closestHeight + 100
      ) {
        // console.log('deleted base geo at: ' + height)
        delete this.loadedBaseGeoHeights[ i ]
      }
    })

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
      if (this.loadedBaseGeoHeights.indexOf(height) === -1) {
        this.loadedBaseGeoHeights.push(height)

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
        let closestBlocksData = data.closestBlocksData

        data.blockHeightIndexes.forEach((height, index) => {
          if (typeof closestBlocksData[height] !== 'undefined') {
            closestBlocksData[height].txValues = data['txValues' + index]
            closestBlocksData[height].txIndexes = data['txIndexes' + index]
            closestBlocksData[height].txSpentRatios = data['txSpentRatios' + index]
          }
        })

        let closestBlocksGeoData = {}

        data.geoBlockHeightIndexes.forEach((height, index) => {
          if (typeof closestBlocksData[height] !== 'undefined') {
            closestBlocksGeoData[height] = {}
            closestBlocksGeoData[height].height = height
            closestBlocksGeoData[height].offsets = data['offsets' + index]
            closestBlocksGeoData[height].scales = data['scales' + index]
          }
        })

        Object.keys(closestBlocksGeoData).forEach((height) => {
          let blockGeoData = closestBlocksGeoData[height]

          if (typeof this.blockGeoDataObject[blockGeoData.height] === 'undefined') {
            if (typeof closestBlocksData[height] !== 'undefined') {
              if (
                blockGeoData.height < this.closestHeight - 10 ||
                blockGeoData.height > this.closestHeight + 10
              ) {
                console.log('moved too far away from block at height: ' + blockGeoData.height)
              } else {
                blockGeoData.blockData = closestBlocksData[height]

                blockGeoData.blockData.pos = {}
                blockGeoData.blockData.pos.x = this.blockPositions[blockGeoData.height * 2 + 0]
                blockGeoData.blockData.pos.z = this.blockPositions[blockGeoData.height * 2 + 1]

                blockGeoData.blockData.healthRatio = (blockGeoData.blockData.fee / blockGeoData.blockData.outputTotal) * 2000 // 0 == healthy

                this.blockGeoDataObject[blockGeoData.height] = {}
                this.blockGeoDataObject[blockGeoData.height].blockData = {
                  bits: blockGeoData.blockData.bits,
                  block_index: blockGeoData.blockData.block_index,
                  fee: blockGeoData.blockData.fee,
                  hash: blockGeoData.blockData.hash,
                  healthRatio: blockGeoData.blockData.healthRatio,
                  height: blockGeoData.blockData.height,
                  main_chain: blockGeoData.blockData.main_chain,
                  mrkl_root: blockGeoData.blockData.mrkl_root,
                  n_tx: blockGeoData.blockData.n_tx,
                  next_block: blockGeoData.blockData.next_block,
                  nonce: blockGeoData.blockData.nonce,
                  outputTotal: blockGeoData.blockData.outputTotal,
                  pos: blockGeoData.blockData.pos,
                  prev_block: blockGeoData.blockData.prev_block,
                  received_time: blockGeoData.blockData.received_time,
                  relayed_by: blockGeoData.blockData.relayed_by,
                  size: blockGeoData.blockData.size,
                  time: blockGeoData.blockData.time,
                  ver: blockGeoData.blockData.ver,
                  txIndexes: blockGeoData.blockData.txIndexes
                }

                this.crystalGenerator.updateGeometry(blockGeoData)
                this.crystalAOGenerator.updateGeometry(blockGeoData)
              }
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
                if (typeof data.hash !== 'undefined') {
                  let blockGeoData = await this.getGeometry(data.hash, height)

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
                      this.crystalAOGenerator.updateGeometry(blockGeoData)
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
                } else if (data.error !== 'undefined') {
                  console.error(data.error)
                }
              }

              let blockHeightWorkerSendObj = {
                cmd: 'get',
                config: this.config,
                height: height
              }

              blockHeightWorker.postMessage(
                blockHeightWorkerSendObj
              )
            }
          }
        })

        this.loadingNearestBlocks = false

        nearestBlocksWorker.terminate()
      }
    }

    // use transferable objects for large data sets
    let sendObj = {
      cmd: 'get',
      closestHeight: this.closestHeight,
      config: this.config,
      maxHeight: this.maxHeight,
      blockHeightIndexes: new Int32Array(9).fill(-1),
      geoBlockHeightIndexes: new Int32Array(9).fill(-1),

      scales0: new Float32Array(this.txCountBufferSize),
      scales1: new Float32Array(this.txCountBufferSize),
      scales2: new Float32Array(this.txCountBufferSize),
      scales3: new Float32Array(this.txCountBufferSize),
      scales4: new Float32Array(this.txCountBufferSize),
      scales5: new Float32Array(this.txCountBufferSize),
      scales6: new Float32Array(this.txCountBufferSize),
      scales7: new Float32Array(this.txCountBufferSize),
      scales8: new Float32Array(this.txCountBufferSize),

      offsets0: new Float32Array(this.txCountBufferSize * 2),
      offsets1: new Float32Array(this.txCountBufferSize * 2),
      offsets2: new Float32Array(this.txCountBufferSize * 2),
      offsets3: new Float32Array(this.txCountBufferSize * 2),
      offsets4: new Float32Array(this.txCountBufferSize * 2),
      offsets5: new Float32Array(this.txCountBufferSize * 2),
      offsets6: new Float32Array(this.txCountBufferSize * 2),
      offsets7: new Float32Array(this.txCountBufferSize * 2),
      offsets8: new Float32Array(this.txCountBufferSize * 2),

      txValues0: new Float32Array(this.txCountBufferSize),
      txValues1: new Float32Array(this.txCountBufferSize),
      txValues2: new Float32Array(this.txCountBufferSize),
      txValues3: new Float32Array(this.txCountBufferSize),
      txValues4: new Float32Array(this.txCountBufferSize),
      txValues5: new Float32Array(this.txCountBufferSize),
      txValues6: new Float32Array(this.txCountBufferSize),
      txValues7: new Float32Array(this.txCountBufferSize),
      txValues8: new Float32Array(this.txCountBufferSize),

      txIndexes0: new Uint32Array(this.txCountBufferSize),
      txIndexes1: new Uint32Array(this.txCountBufferSize),
      txIndexes2: new Uint32Array(this.txCountBufferSize),
      txIndexes3: new Uint32Array(this.txCountBufferSize),
      txIndexes4: new Uint32Array(this.txCountBufferSize),
      txIndexes5: new Uint32Array(this.txCountBufferSize),
      txIndexes6: new Uint32Array(this.txCountBufferSize),
      txIndexes7: new Uint32Array(this.txCountBufferSize),
      txIndexes8: new Uint32Array(this.txCountBufferSize),

      txSpentRatios0: new Float32Array(this.txCountBufferSize),
      txSpentRatios1: new Float32Array(this.txCountBufferSize),
      txSpentRatios2: new Float32Array(this.txCountBufferSize),
      txSpentRatios3: new Float32Array(this.txCountBufferSize),
      txSpentRatios4: new Float32Array(this.txCountBufferSize),
      txSpentRatios5: new Float32Array(this.txCountBufferSize),
      txSpentRatios6: new Float32Array(this.txCountBufferSize),
      txSpentRatios7: new Float32Array(this.txCountBufferSize),
      txSpentRatios8: new Float32Array(this.txCountBufferSize)
    }

    nearestBlocksWorker.postMessage(
      sendObj,
      [
        sendObj.blockHeightIndexes.buffer,
        sendObj.geoBlockHeightIndexes.buffer,

        sendObj.scales0.buffer,
        sendObj.scales1.buffer,
        sendObj.scales2.buffer,
        sendObj.scales3.buffer,
        sendObj.scales4.buffer,
        sendObj.scales5.buffer,
        sendObj.scales6.buffer,
        sendObj.scales7.buffer,
        sendObj.scales8.buffer,

        sendObj.offsets0.buffer,
        sendObj.offsets1.buffer,
        sendObj.offsets2.buffer,
        sendObj.offsets3.buffer,
        sendObj.offsets4.buffer,
        sendObj.offsets5.buffer,
        sendObj.offsets6.buffer,
        sendObj.offsets7.buffer,
        sendObj.offsets8.buffer,

        sendObj.txValues0.buffer,
        sendObj.txValues1.buffer,
        sendObj.txValues2.buffer,
        sendObj.txValues3.buffer,
        sendObj.txValues4.buffer,
        sendObj.txValues5.buffer,
        sendObj.txValues6.buffer,
        sendObj.txValues7.buffer,
        sendObj.txValues8.buffer,

        sendObj.txIndexes0.buffer,
        sendObj.txIndexes1.buffer,
        sendObj.txIndexes2.buffer,
        sendObj.txIndexes3.buffer,
        sendObj.txIndexes4.buffer,
        sendObj.txIndexes5.buffer,
        sendObj.txIndexes6.buffer,
        sendObj.txIndexes7.buffer,
        sendObj.txIndexes8.buffer,

        sendObj.txSpentRatios0.buffer,
        sendObj.txSpentRatios1.buffer,
        sendObj.txSpentRatios2.buffer,
        sendObj.txSpentRatios3.buffer,
        sendObj.txSpentRatios4.buffer,
        sendObj.txSpentRatios5.buffer,
        sendObj.txSpentRatios6.buffer,
        sendObj.txSpentRatios7.buffer,
        sendObj.txSpentRatios8.buffer
      ]
    )
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

  toggleDateSearch () {
    this.setState({
      txSearchOpen: false,
      dateSearchOpen: !this.state.dateSearchOpen
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

  prepareCamNavigation () {
    this.setState({
      showIntro: false
    })
    this.audioManager.stopNotes()
    this.audioManager.fadeOutBlockAudio()
    this.exitAutoPilot()
    this.hideMerkleDetail()
    this.hideVRText()
    this.closeSidebar()
  }

  goToRandomBlock () {
    this.prepareCamNavigation()

    this.closestHeight = Math.round(Math.random() * this.maxHeight)

    this.loadNearestBlocks(true, this.closestHeight)

    let posX = this.blockPositions[this.closestHeight * 2 + 0]
    let posZ = this.blockPositions[this.closestHeight * 2 + 1]

    let to = new THREE.Vector3(posX, 1000000, posZ)

    this.prepareCamAnim(new THREE.Vector3(to.x, 500, to.z))

    let aboveStart = this.camera.position.clone()
    aboveStart.y = 1000000

    let blockYDist = this.vrActive ? 20 : 400

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(new THREE.Vector3(aboveStart.x, 2000, aboveStart.z), 10000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
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
                  .to(new THREE.Vector3(to.x, 2000, to.z), 10000)
                  .onUpdate(function () {
                    that.camera.position.set(this.x, this.y, this.z)
                  })
                  .onComplete(() => {
                    new TWEEN.Tween(this.camera.position)
                      .to(new THREE.Vector3(to.x, blockYDist, to.z), 10000)
                      .onUpdate(function () {
                        that.camera.position.set(this.x, this.y, this.z)
                      })
                      .onComplete(() => {
                        this.animatingCamera = false
                      })
                      .easing(TWEEN.Easing.Quadratic.Out)
                      .start()
                  })
                  .easing(this.defaultCamEasing)
                  .start()
              })
              .easing(this.defaultCamEasing)
              .start()
          })
          .easing(this.defaultCamEasing)
          .start()
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(20000)
  }

  async goToBlock (blockHeight = null) {
    return new Promise((resolve) => {
      this.isNavigating = true

      this.prepareCamNavigation()

      if (blockHeight !== null) {
        this.closestHeight = blockHeight
      } else if (this.closestHeight === null) {
        this.closestHeight = this.maxHeight
      }

      this.loadNearestBlocks(true, this.closestHeight)

      let posX = this.blockPositions[this.closestHeight * 2 + 0]
      let posZ = this.blockPositions[this.closestHeight * 2 + 1]

      let to = new THREE.Vector3(posX, 1000000, posZ)

      this.prepareCamAnim(new THREE.Vector3(to.x, 500, to.z))

      let aboveStart = this.camera.position.clone()
      aboveStart.y = 1000000

      let blockYDist = this.vrActive ? 20 : 400

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
                .to(new THREE.Vector3(to.x, 2000, to.z), 10000)
                .onUpdate(function () {
                  that.camera.position.set(this.x, this.y, this.z)
                })
                .onComplete(() => {
                  new TWEEN.Tween(this.camera.position)
                    .to(new THREE.Vector3(to.x, blockYDist, to.z), 10000)
                    .onUpdate(function () {
                      that.camera.position.set(this.x, this.y, this.z)
                    })
                    .onComplete(() => {
                      resolve(true)
                      this.isNavigating = false
                      this.animatingCamera = false
                    })
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .start()
                })
                .easing(this.defaultCamEasing)
                .start()
            })
            .easing(this.defaultCamEasing)
            .start()
        })
        .easing(this.defaultCamEasing)
        .start()

      this.animateCamRotation(20000)
    })
  }

  exitAutoPilot () {
    this.autoPilotDirection = false
    this.autoPilot = false
  }

  stopAutoPilot () {
    this.toggleTopView()
  }

  toggleAutoPilotDirection (direction = 'backward') {
    if (this.isNavigating) {
      return
    }

    if (typeof this.autoPilotTween !== 'undefined') {
      this.autoPilotTween.stop()
    }

    if (typeof this.cameraMainRotationTween !== 'undefined') {
      this.cameraMainRotationTween.stop()
    }

    this.autoPilot = false

    this.autoPilotDirection = direction

    this.startAutoPilot()
  }

  startAutoPilot () {
    this.audioManager.stopNotes()

    this.setAutoPilotState()

    if (this.vrActive) {
      this.autoPilotAnimLoopVR()
    } else {
      this.autoPilotAnimLoop()
    }
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

    let toBlockVec = new THREE.Vector3(posX, this.autoPilotYPos, posZ).sub(new THREE.Vector3(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      this.autoPilotYPos,
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    )).normalize().multiplyScalar(500)

    let to = new THREE.Vector3(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      this.autoPilotYPos,
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    ).add(toBlockVec)
    let toTarget = new THREE.Vector3(posX, this.autoPilotYPos + 20, posZ)

    this.prepareCamAnim(to, toTarget)

    let that = this
    let camPos = {x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z}

    this.autoPilotTween = new TWEEN.Tween(camPos)
      .to(to, 20000)
      .onUpdate(function () {
        if (!that.autoPilot) {
          return
        }

        that.camera.position.set(camPos.x, camPos.y, camPos.z)
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

  autoPilotAnimLoopVR () {
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

    let toBlockVec = new THREE.Vector2(posX, posZ).sub(new THREE.Vector2(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    )).normalize().multiplyScalar(500)

    let to = new THREE.Vector2(
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 0],
      this.blockPositions[(this.closestBlock.blockData.height) * 2 + 1]
    ).add(toBlockVec)

    let camPos = {x: this.camera.position.x, y: this.camera.position.z}

    let that = this

    this.autoPilotTween = new TWEEN.Tween(camPos)
      .to(to, 30000)
      .onUpdate(function () {
        if (!that.autoPilot) {
          return
        }

        that.camera.position.x = camPos.x
        that.camera.position.z = camPos.y
      })
      .onComplete(() => {
        setTimeout(() => {
          if (this.autoPilot) {
            this.autoPilotAnimLoopVR()
          }
        }, 10)
      })
      .start()
  }

  renderFrame () {
    this.frame++

    let delta = this.clock.getDelta()

    TWEEN.update()

    if (this.controls) {
      this.controls.update(delta)
    }

    if (this.picker) {
      this.updatePicker()
    }

    this.getClosestBlock()

    if (this.blockReady) {
      if (!this.vrActive && this.audioManager.analyser && window.oscilloscope) {
        window.oscilloscope.drawScope(this.audioManager.analyser, window.oscilloscope.refs.scope)
      }

      if (this.frame % 500 === 0) {
        if (this.vrActive) {
          this.bindVRGamepadEvents()
        }

        this.loadNearestBlocks()
      }

      this.setRenderOrder()

      this.diskGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position,
        maxHeight: this.maxHeight
      })

      this.glowGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position
      })

      this.bgGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position
      })

      this.txGenerator.update({
        time: window.performance.now()
      })

      this.undersideGenerator.update({
        time: window.performance.now()
      })

      this.particlesGenerator.update({
        time: window.performance.now(),
        deltaTime: delta
      })

      this.crystalGenerator.update({
        time: window.performance.now(),
        camPos: this.camera.position,
        autoPilot: this.autoPilot
      })

      this.crystalAOGenerator.update(window.performance.now())
      this.treeGenerator.update(window.performance.now())
    }

    if (this.vrActive) {
      this.viveController1Buttons.update()
      this.viveController2Buttons.update()
      if (this.viveTriggerPressed1 && this.viveTriggerPressed2) {
        if (this.camera.position.y < 2000) {
          this.camera.position.y += 0.25
        }
      } else {
        if (this.camera.position.y > 20) {
          this.camera.position.y -= 0.1
        }
      }
    }

    // this.setState({
    //   posX: this.camera.position.x.toFixed(3),
    //   posY: this.camera.position.y.toFixed(3),
    //   posZ: this.camera.position.z.toFixed(3)
    // })

    // this.FilmShaderPass.uniforms.time.value = window.performance.now() * 0.000001

    if (this.particlesGenerator && this.particlesGenerator.positionScene) {
      if (this.config.debug.debugPicker && this.pickingScene) {
        if (this.WebVRLib.VRSupported) {
          this.renderer.vr.enabled = true
        }
        this.renderer.setRenderTarget(null)
        this.renderer.render(this.pickingScene, this.cameraMain)
      } else {
        // this.renderer.render(this.particlesGenerator.positionScene, this.particlesGenerator.quadCamera)
        if (this.WebVRLib.VRSupported) {
          this.renderer.vr.enabled = true
        }
        this.renderer.setRenderTarget(null)
        this.renderer.render(this.scene, this.cameraMain)
        // this.composer.render()
      }
    }
  }

  async playTutorial () {
    await this.audioManager.playNarrationFile('tutorial', '1')
    await this.audioManager.playNarrationFile('tutorial', '2')
    await this.audioManager.playNarrationFile('tutorial', '3')
    await this.audioManager.playNarrationFile('tutorial', '4')
    await this.audioManager.playNarrationFile('tutorial', '5')
    await this.audioManager.playNarrationFile('tutorial', '6')
    return true
  }

  async showVRTitleText (text = '', fadeTime = 10000) {
    let meshObj = {
      text: '',
      position: { x: -3.3, y: -2, z: -9 },
      width: 700,
      align: 'center',
      scale: 0.0095,
      lineHeight: 48
    }

    meshObj.text = text
    let introTextMesh = await this.textGenerator.create(meshObj)

    this.cameraMain.remove(this.introTextMesh)
    this.introTextMesh = introTextMesh
    this.cameraMain.add(this.introTextMesh)

    // fade text out
    let that = this
    new TWEEN.Tween({opacity: 1})
      .to({opacity: 0}, fadeTime)
      .onUpdate(function () {
        that.introTextMesh.material.uniforms.opacity.value = this.opacity
      })
      .easing(that.defaultCamEasing)
      .start()
  }

  async startStory () {
    this.currentChapter = 1

    await this.goToBlock(this.chapters[this.currentChapter].height)
    this.showVRTitleText(this.chapters[this.currentChapter].title)

    await this.audioManager.playNarrationFile('genesis', '1')
    // await this.audioManager.playNarrationFile('genesis', '2')
    // await this.audioManager.playNarrationFile('genesis', '3')
    // await this.audioManager.playNarrationFile('genesis', '4')
  }

  async advanceToNextChapter () {
    // if (this.audioManager.narrationPlaying || this.animatingCamera) {
    if (this.audioManager.narrationPlaying || this.isNavigating) {
      return
    }

    this.currentChapter++

    this.audioManager.masterBus.gain.setTargetAtTime(0.1, this.audioManager.audioContext.currentTime, 2.0)

    switch (this.currentChapter) {
      case 2:
        await this.goToBlock(this.chapters[2].height)
        this.showVRTitleText(this.chapters[2].title)
        await this.audioManager.playNarrationFile('pizza', '1')
        break
      case 3:
        await this.goToBlock(this.chapters[3].height)
        this.toggleUndersideView()
        this.showVRTitleText(this.chapters[3].title)
        await this.audioManager.playNarrationFile('merkle-tree', '1')
        // await this.audioManager.playNarrationFile('merkle-tree', '2')
        // await this.audioManager.playNarrationFile('merkle-tree', '3')
        // await this.audioManager.playNarrationFile('merkle-tree', '4')
        break
      case 4:
        await this.goToBlock(this.chapters[4].height)
        this.showVRTitleText(this.chapters[4].title)
        await this.audioManager.playNarrationFile('congestion', '1')
        // await this.audioManager.playNarrationFile('congestion', '2')
        // await this.audioManager.playNarrationFile('congestion', '3')
        // await this.audioManager.playNarrationFile('congestion', '4')
        break
      case 5:
        await this.goToBlock(this.maxHeight)
        this.showVRTitleText(this.chapters[5].title)
        await this.audioManager.playNarrationFile('latest', '1')
        break
      case 6:
        this.prepareCamNavigation()
        let to = new THREE.Vector3(10000, 20000, 10000)
        this.prepareCamAnim(new THREE.Vector3(to.x, to.y, to.z))
        let that = this
        new TWEEN.Tween(this.camera.position)
          .to(to, 50000)
          .onUpdate(function () {
            that.camera.position.set(this.x, this.y, this.z)
          })
          .onComplete(async () => {
            that.showVRTitleText('YOU CAN ACCESS SYMPHONY AT ANY TIME IN A WEB BROWSER AT SYMPHONY.IOHK.IO')
            await that.audioManager.playNarrationFile('end', '1')

            // restart
            window.location.reload()
          })
          .easing(this.defaultCamEasing)
          .start()

        this.showVRTitleText(this.chapters[6].title)
        await this.audioManager.playNarrationFile('mempool', '1')
        break

      default:
        break
    }

    this.audioManager.masterBus.gain.setTargetAtTime(0.8, this.audioManager.audioContext.currentTime, 2.0)
  }

  async startIntro () {
    this.setState({
      started: true
    })

    if (!this.config.scene.showIntro) {
      this.goToBlock()
    } else {
      if (this.vrActive) {
        // await this.playTutorial()

        // this.showVRTitleText('THIS IS THE BITCOIN BLOCKCHAIN', 5000)
        // await this.audioManager.playNarrationFile('intro', '1', 3000)

        // this.showVRTitleText('BLOCKS SPIRAL OUTWARD FROM THE CENTER, STARTING WITH THE LATEST BLOCK', 6000)
        // await this.audioManager.playNarrationFile('intro', '2', 3000)

        // this.showVRTitleText('A NEW BLOCK IS CREATED ROUGHLY EVERY 10 MINUTES', 6000)
        // await this.audioManager.playNarrationFile('intro', '3', 3000)

        // this.showVRTitleText('THE MEMPOOL SITS AT THE CENTER, UNCONFIRMED TRANSACTIONS GATHER HERE', 6000)
        // await this.audioManager.playNarrationFile('intro', '4', 3000)

        // this.showVRTitleText(`THERE ARE ${(this.maxHeight).toLocaleString('en')} BLOCKS SO FAR...`, 6000)

        this.startStory()
      } else {
        this.setState({
          showIntro: true
        })
        setTimeout(() => {
          this.setState({
            activeIntro: 1
          })
          setTimeout(() => {
            this.setState({
              activeIntro: 2
            })
            setTimeout(() => {
              this.setState({
                activeIntro: 3
              })
              setTimeout(() => {
                this.setState({
                  activeIntro: 4
                })
                setTimeout(() => {
                  this.setState({
                    activeIntro: 5
                  })
                  setTimeout(() => {
                    this.setState({
                      activeIntro: 6
                    })
                  }, this.config.scene.introTextTime)
                }, this.config.scene.introTextTime)
              }, this.config.scene.introTextTime)
            }, this.config.scene.introTextTime)
          }, this.config.scene.introTextTime)
        }, 2000)
      }
    }
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)

    this.on('blockChanged', () => {
      this.addClosestBlockDetail()
    })

    this.resize()

    this.audioManager.on('loopend', (blockData) => {
      this.crystalGenerator.updateBlockStartTimes(blockData)
      this.crystalAOGenerator.updateBlockStartTimes(blockData)
    })

    document.addEventListener('mousemove', this.onMouseMove.bind(this), false)

    document.addEventListener('mouseup', (e) => {
      if (e.target.className !== 'hud' && e.target.className !== 'cockpit-border') {
        return
      }
      // if (e.button === 2) {
      //   this.goToRandomBlock()
      // }
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
  }

  setupViveControllers () {
    if (this.viveController1 && !this.VRController1EventsBound) {
      if (typeof this.viveController1.userData.inputSource !== 'undefined') {
        if (this.viveController1.userData.inputSource.handedness === 'right') {
          this.setupRightViveController(this.viveController1, this.viveController1MeshGroup)
        }

        if (this.viveController1.userData.inputSource.handedness === 'left') {
          this.setupLeftViveController(this.viveController1, this.viveController1MeshGroup)
        }

        console.log('vive 1 setup')
        this.VRController1EventsBound = true
      }
    }

    if (this.viveController2 && !this.VRController2EventsBound) {
      if (typeof this.viveController2.userData.inputSource !== 'undefined') {
        if (this.viveController2.userData.inputSource.handedness === 'right') {
          this.setupRightViveController(this.viveController2, this.viveController2MeshGroup)
        }

        if (this.viveController2.userData.inputSource.handedness === 'left') {
          this.setupLeftViveController(this.viveController2, this.viveController2MeshGroup)
        }

        console.log('vive 2 setup')
        this.VRController2EventsBound = true
      }
    }
  }

  setupRightViveController (viveController, meshGroup) {
    viveController.addEventListener('select', this.onVRControllerSelect.bind(this))

    this.controllerCam = new THREE.PerspectiveCamera(
      this.config.camera.fov,
      window.innerWidth / window.innerHeight,
      1.0,
      5000000
    )
    meshGroup.add(this.controllerCam)

    let lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
    ])

    let lineMat = new THREE.LineBasicMaterial({
      color: 0x6ad16a
    })

    let line = new THREE.Line(lineGeo, lineMat)
    line.scale.z = 5

    meshGroup.add(line)

    // add buttons
    let buttonGeo = new THREE.PlaneBufferGeometry(0.018, 0.018, 1)
    buttonGeo.rotateX(-(Math.PI / 2))

    this.textureLoader.setPath('assets/images/textures/vr-ui/')
    let buttonPrevMap = this.textureLoader.load('prev.png')

    // prev button
    let buttonPrevMat = new THREE.MeshBasicMaterial({
      map: buttonPrevMap,
      transparent: true,
      alphaTest: 0.5
    })
    let buttonPrevMesh = new THREE.Mesh(buttonGeo, buttonPrevMat)
    buttonPrevMesh.position.x = -0.015
    buttonPrevMesh.position.y = 0.009
    buttonPrevMesh.position.z = 0.05
    meshGroup.add(buttonPrevMesh)

    // next button
    let buttonNextMap = this.textureLoader.load('next.png')
    let buttonNextMat = new THREE.MeshBasicMaterial({
      map: buttonNextMap,
      transparent: true,
      alphaTest: 0.5
    })
    let buttonNextMesh = new THREE.Mesh(buttonGeo, buttonNextMat)
    buttonNextMesh.position.x = 0.015
    buttonNextMesh.position.y = 0.009
    buttonNextMesh.position.z = 0.05
    meshGroup.add(buttonNextMesh)

    // up button
    let buttonUpMap = this.textureLoader.load('up.png')
    let buttonUpMat = new THREE.MeshBasicMaterial({
      map: buttonUpMap,
      transparent: true,
      alphaTest: 0.5
    })

    let buttonUpMesh = new THREE.Mesh(buttonGeo, buttonUpMat)
    buttonUpMesh.position.y = 0.009
    buttonUpMesh.position.z = 0.035
    meshGroup.add(buttonUpMesh)

    // down button
    let buttonDownMap = this.textureLoader.load('down.png')
    let buttonDownMat = new THREE.MeshBasicMaterial({
      map: buttonDownMap,
      transparent: true,
      alphaTest: 0.5
    })
    let buttonDownMesh = new THREE.Mesh(buttonGeo, buttonDownMat)
    buttonDownMesh.position.y = 0.009
    buttonDownMesh.position.z = 0.065
    meshGroup.add(buttonDownMesh)

    // // info button
    // let buttonInfoMap = this.textureLoader.load('info.png')
    // let buttonInfoMat = new THREE.MeshBasicMaterial({
    //   map: buttonInfoMap,
    //   transparent: true,
    //   alphaTest: 0.5
    // })

    // let buttonInfoMesh = new THREE.Mesh(buttonGeo, buttonInfoMat)
    // buttonInfoMesh.position.y = 0.009
    // buttonInfoMesh.position.z = 0.0
    // viveController.add(buttonInfoMesh)
  }

  setupLeftViveController (viveController, meshGroup) {
    // add buttons
    let buttonGeo = new THREE.PlaneBufferGeometry(0.028, 0.028, 1)
    buttonGeo.rotateX(-(Math.PI / 2))

    this.textureLoader.setPath('assets/images/textures/vr-ui/')

    // next chapter button
    let buttonNextChapterMap = this.textureLoader.load('next-chapter.png')
    let buttonNextChapterMat = new THREE.MeshBasicMaterial({
      map: buttonNextChapterMap,
      transparent: true,
      alphaTest: 0.5
    })
    let buttonNextChapterMesh = new THREE.Mesh(buttonGeo, buttonNextChapterMat)
    buttonNextChapterMesh.position.y = 0.009
    buttonNextChapterMesh.position.z = 0.05
    meshGroup.add(buttonNextChapterMesh)
  }

  bindVRGamepadEvents () {
    this.setupViveControllers()

    if (!this.VRGamepad1EventsBound) {
      if (this.viveController1Buttons.gamepad) {
        this.viveController1Buttons.addEventListener('triggerdown', function (e) {
          this.viveTriggerPressed1 = true
        }.bind(this))

        this.viveController1Buttons.addEventListener('triggerup', function (e) {
          this.viveTriggerPressed1 = false
        }.bind(this))

        this.viveController1Buttons.addEventListener('thumbpaddown', function (e) {
          this.viveController1Buttons.interactionTimeout = setTimeout(() => {
            switch (this.viveController1Buttons.gamepad.hand) {
              case 'right':
                this.viveControllerRightDPadEvents(e)
                break
              case 'left':
                this.viveControllerLeftDPadEvents(e)
                break

              default:
                break
            }
          }, this.config.VR.interactionTimeout)
        }.bind(this))

        this.viveController1Buttons.addEventListener('menudown', function (e) {
          console.log('menudown')
          this.viveController1Buttons.interactionTimeout = setTimeout(() => {
            switch (this.viveController1Buttons.gamepad.hand) {
              case 'right':
                this.viveControllerRightMenuEvents(e)
                break
              case 'left':
                this.viveControllerLeftMenuEvents(e)
                break

              default:
                break
            }
          }, this.config.VR.interactionTimeout)
        }.bind(this))

        this.viveController1Buttons.addEventListener('thumbpadup', function (e) {
          clearTimeout(this.viveController1Buttons.interactionTimeout)
        }.bind(this))

        this.VRGamepad1EventsBound = true
      }
    }

    if (!this.VRGamepad2EventsBound) {
      if (this.viveController2Buttons.gamepad) {
        this.viveController2Buttons.addEventListener('triggerdown', function (e) {
          this.viveTriggerPressed2 = true
        }.bind(this))

        this.viveController2Buttons.addEventListener('triggerup', function (e) {
          this.viveTriggerPressed2 = false
        }.bind(this))

        this.viveController2Buttons.addEventListener('thumbpaddown', function (e) {
          this.viveController2Buttons.interactionTimeout = setTimeout(() => {
            switch (this.viveController2Buttons.gamepad.hand) {
              case 'right':
                this.viveControllerRightDPadEvents(e)
                break
              case 'left':
                this.viveControllerLeftDPadEvents(e)
                break

              default:
                break
            }
          }, this.config.VR.interactionTimeout)
        }.bind(this))

        this.viveController2Buttons.addEventListener('menudown', function (e) {
          console.log('menudown')
          this.viveController2Buttons.interactionTimeout = setTimeout(() => {
            switch (this.viveController2Buttons.gamepad.hand) {
              case 'right':
                this.viveControllerRightMenuEvents(e)
                break
              case 'left':
                this.viveControllerLeftMenuEvents(e)
                break

              default:
                break
            }
          }, this.config.VR.interactionTimeout)
        }.bind(this))

        this.viveController2Buttons.addEventListener('thumbpadup', function (e) {
          clearTimeout(this.viveController2Buttons.interactionTimeout)
        }.bind(this))

        this.VRGamepad2EventsBound = true
      }
    }
  }

  viveControllerRightDPadEvents (e) {
    // left dpad
    if (e.axes[0] < 0 && e.axes[1] < 0.5 && e.axes[1] > -0.5) {
      if (this.closestBlock) {
        this.toggleAutoPilotDirection('backward')
      }
    }

    // right dpad
    if (e.axes[0] > 0 && e.axes[1] < 0.5 && e.axes[1] > -0.5) {
      if (this.closestBlock) {
        this.toggleAutoPilotDirection('forward')
      }
    }

    // top dpad
    if (e.axes[1] > 0 && e.axes[0] < 0.5 && e.axes[0] > -0.5) {
      this.toggleTopView()
    }

    // bottom dpad
    if (e.axes[1] < 0 && e.axes[0] < 0.5 && e.axes[0] > -0.5) {
      this.toggleUndersideView()
    }
  }

  viveControllerLeftDPadEvents (e) {
    this.advanceToNextChapter()

    // // left dpad
    // if (e.axes[0] < 0 && e.axes[1] < 0.5 && e.axes[1] > -0.5) {

    // }

    // // right dpad
    // if (e.axes[0] > 0 && e.axes[1] < 0.5 && e.axes[1] > -0.5) {

    // }

    // // top dpad
    // if (e.axes[1] > 0 && e.axes[0] < 0.5 && e.axes[0] > -0.5) {
    //   this.goToBlock()
    // }

    // // bottom dpad
    // if (e.axes[1] < 0 && e.axes[0] < 0.5 && e.axes[0] > -0.5) {
    //   this.goToRandomBlock()
    // }
  }

  viveControllerLeftMenuEvents () {

  }

  viveControllerRightMenuEvents () {
    // Merkle Tree Narration
    // if (this.camera.position.y < 0) {
    //   this.audioManager.playNarrationFile('merkle-tree', '1')
    // }
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

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

    this.setState({
      closestBlock: this.closestBlock
    })

    this.addBlockHeightVRText(this.closestBlock.blockData)
    this.addBlockDetailsVRText(this.closestBlock.blockData)

    let indexOffset = this.planeGenerator.blockHeightIndex[this.closestBlock.blockData.height]

    this.originOffset = new THREE.Vector2(
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 0],
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 1]
    )

    let txIndexOffset = this.crystalGenerator.txIndexOffsets[this.closestBlock.blockData.height]

    // get rotation
    let quat = new THREE.Quaternion(
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 0],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 1],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 2],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 3]
    )

    this.closestBlockOffsets = new Float32Array(this.closestBlock.blockData.n_tx * 3)
    this.closestBlockOffsets2D = new Float32Array(this.closestBlock.blockData.n_tx * 2)
    this.closestBlockScales = new Float32Array(this.closestBlock.blockData.n_tx)
    this.closestBlockTXValues = new Float32Array(this.closestBlock.blockData.n_tx)
    this.closestBlockSpentRatios = new Float32Array(this.closestBlock.blockData.n_tx)

    for (let index = 0; index < this.closestBlock.blockData.n_tx; index++) {
      this.closestBlockOffsets[index * 3 + 0] = this.crystal.geometry.attributes.offset.array[(txIndexOffset * 3) + (index * 3 + 0)]
      this.closestBlockOffsets[index * 3 + 1] = this.crystal.geometry.attributes.offset.array[(txIndexOffset * 3) + (index * 3 + 1)]
      this.closestBlockOffsets[index * 3 + 2] = this.crystal.geometry.attributes.offset.array[(txIndexOffset * 3) + (index * 3 + 2)]

      this.closestBlockOffsets2D[index * 2 + 0] = this.crystalGenerator.offsetsArray2D[(txIndexOffset * 2) + (index * 2 + 0)]
      this.closestBlockOffsets2D[index * 2 + 1] = this.crystalGenerator.offsetsArray2D[(txIndexOffset * 2) + (index * 2 + 1)]
    }

    for (let index = 0; index < this.closestBlock.blockData.n_tx; index++) {
      this.closestBlockTXValues[index] = this.crystalGenerator.txValuesArray[txIndexOffset + index]
      this.closestBlockScales[index] = this.crystal.geometry.attributes.scale.array[txIndexOffset + index]
      this.closestBlockSpentRatios[index] = this.crystal.geometry.attributes.spentRatio.array[txIndexOffset + index]
    }

    this.pickerGenerator.updateGeometry(
      this.closestBlock,
      this.closestBlockOffsets,
      this.closestBlockScales
    )

    this.boundingBoxObj.rotation.x = 0
    this.boundingBoxObj.rotation.y = 0
    this.boundingBoxObj.rotation.z = 0
    this.boundingBoxObj.updateMatrix(true)
    this.boundingBoxObj.updateMatrixWorld(true)

    let posX = this.blockPositions[this.closestBlock.blockData.height * 2 + 0]
    let posZ = this.blockPositions[this.closestBlock.blockData.height * 2 + 1]

    this.boundingBoxObj.position.x = posX
    this.boundingBoxObj.position.z = posZ
    this.boundingBoxObj.applyQuaternion(quat)
    this.boundingBoxObj.rotateX(Math.PI / 2)
    this.boundingBoxObj.updateMatrix(true)
    this.boundingBoxObj.updateMatrixWorld(true)

    this.boundingBoxObj.geometry.computeBoundingBox()
    this.boundingBoxObj.updateMatrixWorld(true)

    this.boxMatrixInverse = new THREE.Matrix4().getInverse(this.boundingBoxObj.matrixWorld)
    let inverseBox = this.boundingBoxObj.clone()
    inverseBox.applyMatrix(this.boxMatrixInverse)
    this.boundingBox = new THREE.Box3().setFromObject(inverseBox)

    if (this.controls) {
      this.controls.updateClosestBlockBBox(this.boundingBox, this.boxMatrixInverse)
    }

    for (const height in this.audioManager.audioSources) {
      if (this.audioManager.audioSources.hasOwnProperty(height)) {
        if (
          height < this.closestBlock.blockData.height - 10 ||
          height > this.closestBlock.blockData.height + 10
        ) {
          this.audioManager.audioSources[height].stop()
          delete this.audioManager.audioSources[height]
          delete this.audioManager.buffers[height]
          delete this.audioManager.gainNodes[height]
          // console.log('stopped audio at height: ' + height)
        }

        clearTimeout(this.audioManager.loops[height])
      }
    }

    this.createCubeMap(
      new THREE.Vector3(this.plane.geometry.attributes.planeOffset.array[indexOffset + 0],
        100,
        this.plane.geometry.attributes.planeOffset.array[indexOffset + 1])
    )

    this.updateClosestTrees()

    this.group.position.x = this.originOffset.x
    this.group.position.z = this.originOffset.y
    this.updateOriginOffsets()

    if (typeof this.audioManager.buffers[this.closestBlock.blockData.height] === 'undefined') {
      setTimeout(() => {
        this.audioManager.generate(this.closestBlock.blockData, this.closestBlockTXValues, this.closestBlockSpentRatios)
      }, 500)
      this.crystalGenerator.updateBlockStartTimes(this.closestBlock.blockData)
      this.crystalAOGenerator.updateBlockStartTimes(this.closestBlock.blockData)
    }

    let undersideTexture1 = null
    let undersideTexture2 = null
    let undersideTexture3 = null

    let prevBlock = this.blockGeoDataObject[this.closestBlock.blockData.height - 1]
    let nextBlock = this.blockGeoDataObject[this.closestBlock.blockData.height + 1]

    const nTX1 = this.closestBlock.blockData.n_tx
    undersideTexture1 = await this.circuit.draw(nTX1, this.closestBlock, this.closestBlockOffsets2D)

    if (typeof prevBlock !== 'undefined') {
      if (typeof this.audioManager.buffers[prevBlock.blockData.height] === 'undefined') {
        // this.audioManager.generate(prevBlock.blockData)
        this.crystalGenerator.updateBlockStartTimes(prevBlock.blockData)
        this.crystalAOGenerator.updateBlockStartTimes(prevBlock.blockData)
      }
      // let block2 = prevBlock
      // const nTX2 = block2.blockData.n_tx
      // undersideTexture2 = await this.circuit.draw(nTX2, block2)
    } else {
      this.undersideL.visible = false
    }

    if (typeof nextBlock !== 'undefined') {
      if (typeof this.audioManager.buffers[nextBlock.blockData.height] === 'undefined') {
        // this.audioManager.generate(nextBlock.blockData)
        this.crystalGenerator.updateBlockStartTimes(nextBlock.blockData)
        this.crystalAOGenerator.updateBlockStartTimes(nextBlock.blockData)
      }
      // let block3 = nextBlock
      // const nTX3 = block3.blockData.n_tx
      // undersideTexture3 = await this.circuit.draw(nTX3, block3)
    } else {
      this.undersideR.visible = false
    }

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

  updateOriginOffsets () {
    this.treeGenerator.updateOriginOffset(this.originOffset)
    this.planeGenerator.updateOriginOffset(this.originOffset)
    this.occlusionGenerator.updateOriginOffset(this.originOffset)
    this.crystalGenerator.updateOriginOffset(this.originOffset)
    this.crystalAOGenerator.updateOriginOffset(this.originOffset)
    this.diskGenerator.updateOriginOffset(this.originOffset)
    this.txGenerator.updateOriginOffset(this.originOffset)
  }

  async updateClosestTrees () {
    let centerTree = await this.treeGenerator.get(this.closestBlock.blockData, 0)

    if (this.centerTree) {
      this.group.remove(this.centerTree)
    }
    this.centerTree = centerTree
    this.centerTree.material = this.treeGenerator.materialC
    this.centerTree.renderOrder = 0
    this.group.add(centerTree)

    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height - 1] !== 'undefined') {
      let lTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height - 1].blockData, 1)
      if (this.lTree) {
        this.group.remove(this.lTree)
      }
      this.lTree = lTree
      this.lTree.material = this.treeGenerator.materialL
      this.lTree.renderOrder = 0
      this.group.add(this.lTree)
    }
    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height + 1] !== 'undefined') {
      let rTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height + 1].blockData, 2)
      if (this.rTree) {
        this.group.remove(this.rTree)
      }
      this.rTree = rTree
      this.rTree.material = this.treeGenerator.materialR
      this.rTree.renderOrder = 0
      this.group.add(this.rTree)
    }

    for (let index = 0; index < this.trees.geometry.attributes.display.array.length; index++) {
      this.trees.geometry.attributes.display.array[index] = 1
    }

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
    // if (typeof texture.image === 'undefined') {
    //   return
    // }

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
      default:
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

    // texture.needsUpdate = true
    texture.minFilter = THREE.LinearMipMapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()

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
    // this.group = this.scene
    this.scene.add(this.group)
    this.scene.fog = new THREE.FogExp2(Config.scene.bgColor, Config.scene.fogDensity)

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/space/')
      .load([
        '_RT.png', // right
        '_LF.png', // left
        '_UP.png', // top
        '_DN.png', // bottom
        '_FT.png', // front
        '_BK.png' // back
      ])

    this.scene.background = this.cubeMap
  }

  onVRControllerSelect () {
    // clicking on the same tx twice deselects
    if (this.lastSelectedID === this.lastHoveredID) {
      this.deselectTx()
    } else {
      if (this.txIsHovered) {
        if (this.viveTriggerPressed1 && this.viveTriggerPressed2) {
          return
        }

        this.lastSelectedID = this.lastHoveredID
        if (typeof this.pickerGenerator.txMap[this.lastHoveredID] !== 'undefined') {
          this.selectedTXHash = this.pickerGenerator.txMap[this.lastHoveredID]
          this.selectTX(this.lastSelectedID, this.selectedTXHash)
        }
      } else {
        this.deselectTx()
      }
    }
  }

  initViveControllers () {
    this.camera.remove(this.viveController1)
    this.camera.remove(this.viveController2)

    this.viveController1 = this.renderer.vr.getController(0)
    // this.viveController1.userData.id = 0
    // this.viveController1.addEventListener('select', this.onVRControllerSelect.bind(this))
    this.viveController1.frustumCulled = false
    this.viveController1.renderOrder = -1
    this.camera.add(this.viveController1)

    this.viveController2 = this.renderer.vr.getController(1)
    // this.viveController2.userData.id = 1
    this.viveController2.frustumCulled = false
    this.viveController2.renderOrder = -1
    this.camera.add(this.viveController2)

    this.OBJLoader.setPath('assets/models/obj/vive-controller/')
    this.OBJLoader.load('vr_controller_vive_1_5.obj', function (object) {
      this.textureLoader.setPath('assets/models/obj/vive-controller/')
      let controller = object.children[0]
      controller.material.map = this.textureLoader.load('onepointfive_texture.png')
      controller.material.specularMap = this.textureLoader.load('onepointfive_spec.png')
      controller.frustumCulled = false

      controller.renderOrder = -1

      this.viveController1MeshGroup.rotateX((Math.PI / 4.4))
      this.viveController1MeshGroup.translateZ(-0.08)

      this.viveController2MeshGroup.rotateX((Math.PI / 4.4))
      this.viveController2MeshGroup.translateZ(-0.08)

      this.viveController1MeshGroup.add(controller.clone())
      this.viveController2MeshGroup.add(controller.clone())

      this.viveController1.renderOrder = -1
      this.viveController2.renderOrder = -1

      this.viveController1.add(this.viveController1MeshGroup)
      this.viveController2.add(this.viveController2MeshGroup)
    }.bind(this))
  }

  /**
   * Set up camera with defaults
   */
  initCamera (vrActive = false) {
    this.vrActive = true

    if (this.camera) {
      this.scene.remove(this.camera)
    }

    if (this.cameraMain) {
      this.scene.remove(this.cameraMain)
    }

    this.cameraMain = new THREE.PerspectiveCamera(
      this.config.camera.fov,
      window.innerWidth / window.innerHeight,
      1.0,
      5000000
    )

    if (vrActive) {
      this.camera = new THREE.PerspectiveCamera()
      this.camera.add(this.cameraMain)
      this.initViveControllers()
    } else {
      this.camera = this.cameraMain

      this.camera.remove(this.viveController1)
      this.camera.remove(this.viveController2)
    }

    this.scene.add(this.camera)

    window.camera = this.camera

    this.camera.position.x = this.config.camera.initPos.x
    this.camera.position.y = this.config.camera.initPos.y
    this.camera.position.z = this.config.camera.initPos.z

    this.camera.lookAt(this.config.camera.initTarget)

    this.cameraMain.fov = this.config.camera.fov

    this.cameraMain.updateMatrixWorld()
    this.camera.updateMatrixWorld()
  }

  async addBlockHeightVRText (blockData) {
    if (!this.vrActive) {
      return
    }

    let blockHeightTextMesh = await this.textGenerator.create({
      text: '// BLOCK ' + blockData.height + ' ' + blockData.hash,
      position: {
        x: -10,
        y: -5,
        z: -10
      },
      width: 1400,
      align: 'left',
      scale: 0.0095,
      lineHeight: 48
    })

    blockHeightTextMesh.renderOrder = 0

    this.camera.remove(this.blockHeightTextMesh)
    this.blockHeightTextMesh = blockHeightTextMesh
    this.camera.add(this.blockHeightTextMesh)
  }

  async addBlockDetailsVRText (blockData) {
    if (!this.vrActive) {
      return
    }

    const health = blockData.healthRatio > 1.0 ? 1.0 : blockData.healthRatio
    const healthInv = (1.0 - health).toFixed(1)

    let blockDetailsTextMesh = await this.textGenerator.create({
      text: `
      // BLOCK ${blockData.height}
      
      HEALTH: ${healthInv} / 1.0
      NO. OF TX: ${blockData.n_tx}
      OUTPUT TOTAL: ${(blockData.outputTotal / 100000000).toFixed(2)} BTC
      FEES: ${(blockData.fee / 100000000).toFixed(2)} BTC
      DATE: ${moment.unix(blockData.time).format('YYYY-MM-DD HH:mm:ss')}
      BITS: ${blockData.bits}
      SIZE: ${blockData.size / 1000} KB
      HEIGHT: ${blockData.height}
      MERKLE ROOT: ${blockData.mrkl_root.substring(0, 10)}...
      NONCE: ${blockData.nonce}
      VERSION: ${blockData.ver}
      `,
      position: {
        x: 7,
        y: 4,
        z: -10
      },
      width: 600,
      align: 'left',
      scale: 0.008,
      lineHeight: 48
    })

    blockDetailsTextMesh.renderOrder = 0

    this.camera.remove(this.blockDetailsTextMesh)
    this.blockDetailsTextMesh = blockDetailsTextMesh
    this.camera.add(this.blockDetailsTextMesh)
  }

  async addTXDetailsVRText (txData) {
    if (!this.vrActive) {
      return
    }

    let txDetailsTextMesh = await this.textGenerator.create({
      text: `
      TX-${txData.hash.substring(0, 24)}
      ${moment.unix(txData.time).format('YYYY-MM-DD HH:mm:ss')}
      ${txData.size} BYTES
      FEE: ${txData.fee} BTC
      OUTPUT TOTAL: ${(txData.outTotal).toFixed(2)} BTC
      `,
      position: {
        x: -2.5,
        y: -2,
        z: -9
      },
      width: 1400,
      align: 'left',
      scale: 0.0085,
      lineHeight: 48
    })

    txDetailsTextMesh.renderOrder = 0

    this.cameraMain.remove(this.txDetailsTextMesh)
    this.txDetailsTextMesh = txDetailsTextMesh
    this.cameraMain.add(this.txDetailsTextMesh)

    let that = this

    that.txDetailsTextMesh.material.uniforms.opacity.value = 1.0

    // fade text out
    new TWEEN.Tween({opacity: 1})
      .to({opacity: 0}, 6000)
      .onUpdate(function () {
        that.txDetailsTextMesh.material.uniforms.opacity.value = this.opacity
      })
      .easing(this.defaultCamEasing)
      .start()
  }

  hideVRText () {
    this.camera.remove(this.blockHeightTextMesh)
    this.camera.remove(this.blockDetailsTextMesh)
    this.cameraMain.remove(this.txDetailsTextMesh)
  }

  /**
   * Set up renderer
   */
  initRenderer () {
    this.canvas = document.getElementById(this.config.scene.canvasID)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      canvas: this.canvas
    })

    // this.renderer.setPixelRatio(window.devicePixelRatio)

    this.WebVRLib.setRenderer(this.renderer)
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

    this.cameraMain.aspect = this.width / this.height
    this.cameraMain.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)

    if (this.controllerCam) {
      this.controllerCam.aspect = this.width / this.height
      this.controllerCam.updateProjectionMatrix()
    }

    this.composer.setSize(this.width, this.height)

    if (this.pickingTexture) {
      this.pickingTexture.setSize(this.width, this.height)
    }
  }

  toggleSidebar () {
    this.setState({sidebarOpen: !this.state.sidebarOpen})
  }

  closeSidebar () {
    this.setState({
      sidebarOpen: false,
      txSearchOpen: false,
      blockSearchOpen: false,
      dateSearchOpen: false
    })
  }

  openSidebar () {
    this.setState({sidebarOpen: true})
  }

  searchFocus (e) {
    e.target.focus()
  }

  async lookupTXFromHash () {
    this.audioManager.stopNotes()

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
                .to(new THREE.Vector3(that.camPosTo.x, this.mapControlsYPos, that.camPosTo.z), 5000)
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
    this.cameraMainRotationTween = new TWEEN.Tween(o)
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
    this.audioManager.stopNotes()

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
              .to(new THREE.Vector3(to.x, this.mapControlsYPos, to.z), 5000)
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

  UI () {
    return (
      <div className='symphony-ui'>
        <Sidebar
          toggleSidebar={this.toggleSidebar.bind(this)}
          toggleBlockSearch={this.toggleBlockSearch.bind(this)}
          toggleTxSearch={this.toggleTxSearch.bind(this)}
          goToRandomBlock={this.goToRandomBlock.bind(this)}
          toggleDateSearch={this.toggleDateSearch.bind(this)}
          sidebarOpen={this.state.sidebarOpen}
        />
        {this.UITXSearchBox()}
        {this.UIBlockSearchBox()}
        <BlockDetails
          posX={this.state.posX}
          posY={this.state.posY}
          posZ={this.state.posZ}
          closestBlock={this.state.closestBlock}
          controlType={this.state.controlType}
          txSelected={this.state.txSelected}
          toggleAutoPilotDirection={this.toggleAutoPilotDirection.bind(this)}
          toggleTopView={this.toggleTopView.bind(this)}
          toggleUndersideView={this.toggleUndersideView.bind(this)}
          toggleFlyControls={this.toggleFlyControls.bind(this)}
          stopAutoPilot={this.stopAutoPilot.bind(this)}
        />

      </div>
    )
  }

  UILoadingScreen () {
    let className = 'loading-container'
    if (!this.state.loading) {
      className += ' loaded'
    }

    return (
      <div className={className}>
        <div className='logo-container'>
          <img className='symphony-logo pulsate' src={logo} alt='Symphony Logo' />
          <h1>SYMPHONY • <span>LOADING</span></h1>
        </div>
      </div>
    )
  }

  UIStart () {
    if (!this.state.loading && !this.state.started) {
      return (
        <div className='start-container'>
          <h1 onClick={this.startIntro.bind(this)}>START</h1>
        </div>
      )
    } else {
      return (
        <div />
      )
    }
  }

  UIIntro () {
    if (this.state.showIntro) {
      return (
        <div className='intro-container'>
          <h1 className={(this.state.activeIntro === 1 ? 'show' : '')}>This is the bitcoin blockchain</h1>
          <h1 className={(this.state.activeIntro === 2 ? 'show' : '')}>Blocks spiral outward from the center, starting with the latest block</h1>
          <h1 className={(this.state.activeIntro === 3 ? 'show' : '')}>A new block is created roughly every 10 minutes</h1>
          <h1 className={(this.state.activeIntro === 4 ? 'show' : '')}>The mempool sits at the center, unconfirmed transactions gather here</h1>
          <h1 className={(this.state.activeIntro === 5 ? 'show' : '')}>There are {(this.maxHeight).toLocaleString('en')} blocks so far...</h1>
          <h1 className={(this.state.activeIntro === 6 ? 'show' : '')}><span className='enter-blockchain-text' onClick={() => { this.goToBlock(this.maxHeight) }}>Enter the Blockchain</span></h1>
        </div>
      )
    }
  }

  render () {
    return (
      <div className='symphony'>
        {this.UIIntro()}
        {this.UIStart()}
        {this.UILoadingScreen()}
        <canvas id={this.config.scene.canvasID} />
        {this.UI()}
        <WebVRButton
          initCamera={this.initCamera.bind(this)}
          startVRSession={this.WebVRLib.startVRSession.bind(this.WebVRLib)}
          endVRSession={this.WebVRLib.endVRSession.bind(this.WebVRLib)}
          VRSupported={this.WebVRLib.VRSupported}
        />
      </div>
    )
  }
}

export default App
