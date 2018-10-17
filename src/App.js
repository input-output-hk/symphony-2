// libs
import React, { Component } from 'react'
import * as THREE from 'three'
import GLTFLoader from 'three-gltf-loader'
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
import * as dat from 'dat.gui'
import TWEEN from 'tween.js'

import NearestBlocksWorker from './workers/nearestBlocks.worker.js'

// post
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

    this.planeSize = 500
    this.planeOffsetMultiplier = 1080
    this.planeMargin = 100
    this.blockReady = false
    this.coils = 100
    this.radius = 1000000

    this.loading = false
    this.gltfLoader = new GLTFLoader()
    this.blockGeoDataObject = {}
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()

    this.blockPositions = null
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.topside = null
    this.closestBlockReadyForUpdate = false
    this.drawCircuits = true
    this.firstLoop = false
    this.geoAdded = false
    this.clock = new THREE.Clock()

    this.loadedHeights = []
    this.loadedCircuits = []

    this.mousePos = new THREE.Vector2() // keep track of mouse position
    this.mouseDelta = new THREE.Vector2() // keep track of mouse position

    this.blockAnimStartTime = 0

    this.animatingCamera = false

    this.camPosTo = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camPosToTarget = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromPosition = new THREE.Vector3(0.0, 0.0, 0.0)
    this.camFromRotation = new THREE.Vector3(0.0, 0.0, 0.0)

    this.defaultCamEasing = TWEEN.Easing.Quartic.InOut

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
      this.trees.renderOrder = 1
      this.plane.renderOrder = 2
      this.crystalAO.renderOrder = 3
      this.underside.renderOrder = 4
      this.undersideL.renderOrder = 4
      this.undersideR.renderOrder = 4
      this.topside.renderOrder = 4
      this.topsideL.renderOrder = 4
      this.topsideR.renderOrder = 4
      this.crystal.renderOrder = 5
    } else {
      this.crystal.renderOrder = 1
      this.crystalAO.renderOrder = 2
      this.plane.renderOrder = 3
      this.underside.renderOrder = 4
      this.undersideL.renderOrder = 4
      this.undersideR.renderOrder = 4
      this.topside.renderOrder = 4
      this.topsideL.renderOrder = 4
      this.topsideR.renderOrder = 4
      this.trees.renderOrder = 5
    }
  }

  componentDidMount () {
    this.initStage()
  }

  async initStage () {
    await this.initFirebase()

    this.circuit = new Circuit({FBStorageCircuitRef: this.FBStorageCircuitRef})
    this.audio = new Audio({FBStorageAudioRef: this.FBStorageAudioRef})

    this.crystalGenerator = new Crystal({
      firebaseDB: this.firebaseDB,
      planeSize: this.planeSize
    })

    this.pickerGenerator = new Picker({
      planeSize: this.planeSize
    })

    this.crystalAOGenerator = new CrystalAO({
      firebaseDB: this.firebaseDB,
      planeSize: this.planeSize
    })

    this.planeGenerator = new Plane({
      planeSize: this.planeSize
    })

    this.treeGenerator = new Tree({
      planeSize: this.planeSize
    })

    this.diskGenerator = new Disk({
      planeSize: this.planeSize
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

        //     this.nodes.material.uniforms.nodeIsHovered.value = 1.0
        this.txIsHovered = true
        document.body.style.cursor = 'pointer'
      } else {
        this.emit('txMouseOut', {
          mousePos: this.mousePos
        })

        this.hoveredLight.position.x = -999999
        this.hoveredLight.position.z = -999999

        //     this.nodes.material.uniforms.nodeIsHovered.value = 0.0
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

    // get tx data
    let txData = await window.fetch('https://blockchain.info/rawtx/' + TXHash + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
    let txDataJSON = await txData.json()

    let outTotal = 0
    let inTotal = 0

    txDataJSON.out.forEach((output) => {
      outTotal += output.value
    })

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
      let selectedPosY = 100 + (this.crystal.geometry.attributes.offset.array[(index + txIndexOffset) * 3 + 1])
      let selectedPosZ = this.crystal.geometry.attributes.offset.array[(index + txIndexOffset) * 3 + 2] - this.originOffset.y

      this.selectedLight.position.x = selectedPosX
      this.selectedLight.position.z = selectedPosZ

      let to = new THREE.Vector3(selectedPosX + this.originOffset.x, selectedPosY, selectedPosZ + this.originOffset.y)
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
          this.controls.target = new THREE.Vector3(to.x, 0, to.z)
          this.camera.position.x = to.x
          this.camera.position.z = to.z

          this.setState({searchTXHash: ''})

          this.animatingCamera = false
        })
        .easing(TWEEN.Easing.Linear.None)
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

    let mouseMoveVec = this.mousePos.clone().sub(this.lastMousePos)

    // clicking on the same tx twice deselects
    if (this.lastSelectedID === this.lastHoveredID) {
      this.lastSelectedID = -1
      this.emit('txDeselect', {})

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
      if (mouseMoveVec.lengthSq() > 100) {
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
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.97)
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

            let txTime = map(i, 0, txCount, 0, 20)
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
    // this.planetMesh.castShadow = true

    this.sunGeo = new THREE.SphereBufferGeometry(200000, 25, 25)
    this.sunMat = new THREE.MeshBasicMaterial({
      fog: false,
      color: 0xffe083
    })

    this.sunMesh = new THREE.Mesh(this.sunGeo, this.sunMat)
    this.sunMesh.renderOrder = 5
    this.sunMesh.position.z = 20000000
    this.sunMesh.position.y = 100000

    this.sunLight = new THREE.PointLight(0xffffff, 0.3, 0.0, 0.0)
    // this.sunLight = new THREE.SpotLight(0xffffff, 0.1, 0.0)
    this.sunLight.position.set(0, 100000, 20000000)
    // this.sunLight.castShadow = true

    // let textureLoader = new THREE.TextureLoader()
    // let textureFlare0 = textureLoader.load('assets/images/textures/lensflare/lensflare0.png')
    // let textureFlare3 = textureLoader.load('assets/images/textures/lensflare/lensflare3.png')

    // var lensflare = new Lensflare()
    // lensflare.addElement(new LensflareElement(textureFlare0, 700, 0, this.sunLight.color))
    // lensflare.addElement(new LensflareElement(textureFlare3, 60, 0.6))
    // lensflare.addElement(new LensflareElement(textureFlare3, 70, 0.7))
    // lensflare.addElement(new LensflareElement(textureFlare3, 120, 0.9))
    // lensflare.addElement(new LensflareElement(textureFlare3, 70, 1))
    // this.sunLight.add(lensflare)

    // this.sunLight.shadow.mapSize.width = 1024
    // this.sunLight.shadow.mapSize.height = 1024
    // this.sunLight.shadow.camera.near = 0.5
    // this.sunLight.shadow.camera.far = 50000000

    // this.sunLight.shadow.camera.lookAt(new THREE.Vector3(0, 0, 0))

    // this.sunLight.shadow.camera.updateMatrix()
    // this.sunLight.shadow.camera.updateMatrixWorld()

    this.group.add(this.sunLight)

    this.hoveredLight = new THREE.PointLight(0xff0000, 0.1, 500.0)
    this.hoveredLight.position.set(-999999, 5, -999999)
    this.group.add(this.hoveredLight)

    this.selectedLight = new THREE.PointLight(0xff0000, 0.1, 500.0)
    this.selectedLight.position.set(-999999, 5, -999999)
    this.group.add(this.selectedLight)
  }

  async asyncForEach (array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }

  async getGeometry (hash, blockHeight = null) {
    if (blockHeight && typeof this.blockGeoDataObject[blockHeight] !== 'undefined') {
      return
    }

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

    blockData.pos = {
      x: this.blockPositions[height * 2 + 0],
      z: this.blockPositions[height * 2 + 1]
    }

    this.blockGeoDataObject[height] = blockGeoData
    this.blockGeoDataObject[height].blockData = blockData

    return this.blockGeoDataObject[height]
  }

  async initEnvironment () {
    this.group.add(this.planetMesh)
    this.group.add(this.sunMesh)

    this.disk = await this.diskGenerator.init()
    this.disk.renderOrder = 6
    // this.disk.receiveShadow = true
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

    // TODO: use GPU.js for this loop
    console.time('posLoop')
    for (let i = this.maxHeight; i > 0; i--) {
    // for (let i = 0; i <= this.maxHeight; i++) {
      let away = awayStep * theta
      xOffset = Math.cos(theta) * away
      zOffset = Math.sin(theta) * away

      this.blockPositions[i * 2 + 0] = xOffset
      this.blockPositions[i * 2 + 1] = zOffset

      theta += chord / away
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
            let blockGeoData = await this.getGeometry(hash)

            if (!this.geoAdded) {
              this.crystal = await this.crystalGenerator.init(blockGeoData)

              this.initPicker()
              this.picker = await this.pickerGenerator.init(blockGeoData)
              this.pickingScene.add(this.picker)

              this.group.add(this.crystal)

              this.crystalAO = await this.crystalAOGenerator.init(blockGeoData)
              this.crystalAO.translateY(0.1)
              this.group.add(this.crystalAO)

              this.trees = await this.treeGenerator.init(blockGeoData)
              this.group.add(this.trees)

              this.plane = await this.planeGenerator.init(blockGeoData)
              this.group.add(this.plane)

              let planeX = this.plane.geometry.attributes.planeOffset.array[0]
              let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

              this.camera.position.x = planeX
              this.camera.position.z = planeZ

              this.controls.target = new THREE.Vector3(planeX, 0, planeZ)

              this.group.position.x += planeX
              this.group.position.z += planeZ

              this.geoAdded = true

              this.originOffset = new THREE.Vector2(planeX, planeZ)

              this.treeGenerator.updateOriginOffset(this.originOffset)
              this.planeGenerator.updateOriginOffset(this.originOffset)
              this.crystalGenerator.updateOriginOffset(this.originOffset)
              this.crystalAOGenerator.updateOriginOffset(this.originOffset)
              this.diskGenerator.updateOriginOffset(this.originOffset)

              this.planetMesh.position.x -= this.originOffset.x
              this.planetMesh.position.z -= this.originOffset.y

              this.closestBlockReadyForUpdate = true
            } else {
              this.planeGenerator.updateGeometry(blockGeoData)
              this.treeGenerator.updateGeometry(blockGeoData)
              this.crystalGenerator.updateGeometry(blockGeoData)
              this.crystalAOGenerator.updateGeometry(blockGeoData)
            }
          }
          addCount++
        })

        let undersideGeometry = new THREE.PlaneBufferGeometry(this.planeSize + 10, this.planeSize + 10, 1)
        let undersideMaterial = new THREE.MeshBasicMaterial({
          transparent: true
        })
        this.underside = new THREE.Mesh(undersideGeometry, undersideMaterial)
        this.underside.frustumCulled = false
        this.underside.visible = false

        this.underside.scale.set(1.0, -1.0, 1.0)
        this.underside.translateY(-4.2)
        this.underside.updateMatrix()
        this.group.add(this.underside)

        let undersideMaterialL = new THREE.MeshBasicMaterial({
          transparent: true
        })
        this.undersideL = this.underside.clone()
        this.undersideL.material = undersideMaterialL
        this.group.add(this.undersideL)

        let undersideMaterialR = new THREE.MeshBasicMaterial({
          transparent: true
        })
        this.undersideR = this.underside.clone()
        this.undersideR.material = undersideMaterialR
        this.group.add(this.undersideR)

        let topsideMaterial = new THREE.MeshStandardMaterial({
          side: THREE.BackSide,
          transparent: true
        })
        this.topside = this.underside.clone()
        this.topside.material = topsideMaterial
        this.topside.translateY(4.3)

        let topsideMaterialL = new THREE.MeshStandardMaterial({
          side: THREE.BackSide,
          transparent: true
        })
        this.topsideL = this.topside.clone()
        this.topsideL.material = topsideMaterialL
        this.group.add(this.topsideL)

        let topsideMaterialR = new THREE.MeshStandardMaterial({
          side: THREE.BackSide,
          transparent: true
        })
        this.topsideR = this.topside.clone()
        this.topsideR.material = topsideMaterialR
        this.group.add(this.topsideR)

        this.group.add(this.topside)

        this.blockReady = true
      }.bind(this))
  }

  createCubeMap (pos) {
    this.scene.background = this.crystalGenerator.cubeMap

    this.crystal.material.side = THREE.FrontSide

    let cubeCamera = new THREE.CubeCamera(1.0, 2000, 512)
    cubeCamera.position.copy(pos)

    cubeCamera.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter
    cubeCamera.update(this.renderer, this.scene)

    this.crystal.material.envMap = cubeCamera.renderTarget.texture
    this.crystal.material.side = THREE.DoubleSide

    this.plane.material.envMap = cubeCamera.renderTarget.texture

    this.scene.background = this.cubeMap
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

  toggleMapControls (setPos = true) {
    this.switchControls('map')
    if (this.closestBlock) {
      if (setPos) {
        this.controls.target = new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
        this.camera.position.x = this.closestBlock.blockData.pos.x
        this.camera.position.y = 500
        this.camera.position.z = this.closestBlock.blockData.pos.z
      }
    }
  }

  toggleUndersideControls () {
    this.switchControls('underside')
    this.controls.maxPolarAngle = Math.PI * 2
  }

  toggleFlyControls () {
    this.switchControls('fly')
  }

  switchControls (type) {
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
    this.prepareCamAnim(
      new THREE.Vector3(this.closestBlock.blockData.pos.x, 500, this.closestBlock.blockData.pos.z),
      new THREE.Vector3(this.closestBlock.blockData.pos.x, 0, this.closestBlock.blockData.pos.z)
    )

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(this.camPosTo, 5000)
      .onUpdate(function () {
        that.camera.position.set(this.x, this.y, this.z)
      })
      .onComplete(() => {
        this.toggleMapControls()
        this.controls.target = this.camPosTarget
      })
      .easing(this.defaultCamEasing)
      .start()

    this.animateCamRotation(5000)
  }

  toggleUndersideView () {
    let to = new THREE.Vector3(this.closestBlock.blockData.pos.x - 100, -200, this.closestBlock.blockData.pos.z - 100)
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
    if (Object.keys(this.blockGeoDataObject).length > 0) {
      let closestDist = Number.MAX_SAFE_INTEGER

      for (const height in this.blockGeoDataObject) {
        if (this.blockGeoDataObject.hasOwnProperty(height)) {
          const blockGeoData = this.blockGeoDataObject[height]

          const blockPos = new THREE.Vector3(blockGeoData.blockData.pos.x, 0, blockGeoData.blockData.pos.z)
          const blockDist = blockPos.distanceToSquared(this.camera.position)

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
    if (this.loading) {
      return
    }

    if (this.camera.position.y < 20000) {
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

      let closestDist = Number.MAX_SAFE_INTEGER

      let camVec = new THREE.Vector2(this.camera.position.x, this.camera.position.z)

      for (let index = 0; index < this.blockPositions.length / 2; index++) {
        const xComponent = this.blockPositions[index * 2 + 0] - camVec.x
        const zComponent = this.blockPositions[index * 2 + 1] - camVec.y
        const dist = (xComponent * xComponent) + (zComponent * zComponent)

        if (dist < closestDist) {
          closestDist = dist
          this.closestHeight = index
        }
      }

      // unload blocks n away from closest block
      for (const height in this.blockGeoDataObject) {
        if (this.blockGeoDataObject.hasOwnProperty(height)) {
          if (
            height < this.closestHeight - 10 ||
            height > this.closestHeight + 10
          ) {
            delete this.blockGeoDataObject[height]
            console.log('deleted blockdata at: ' + height)
          }
        }
      }

      this.loadedHeights.forEach((height, i) => {
        if (
          height < this.closestHeight - 10 ||
          height > this.closestHeight + 10
        ) {
          delete this.loadedHeights[ i ]
        }
      })

      if (this.loadedHeights.indexOf(this.closestHeight) !== -1) {
        this.loading = false
        return
      }

      this.loadedHeights.push(this.closestHeight)

      console.log(this.blockGeoDataObject)
      console.log(this.loadedHeights)

      let closestBlocksData = []
      let closestBlocksGeoData = []

      const nearestBlocksWorker = new NearestBlocksWorker()
      nearestBlocksWorker.onmessage = async ({ data }) => {
        console.log(data)

        closestBlocksData = data.closestBlocksData
        closestBlocksGeoData = data.closestBlocksGeoData

        closestBlocksGeoData.forEach(async (blockGeoData, i) => {
          if (typeof this.blockGeoDataObject[blockGeoData.height] === 'undefined') {
            if (typeof closestBlocksData[i] !== 'undefined') {
              blockGeoData.blockData = closestBlocksData[i]

              blockGeoData.blockData.pos = {}
              blockGeoData.blockData.pos.x = this.blockPositions[blockGeoData.height * 2 + 0]
              blockGeoData.blockData.pos.z = this.blockPositions[blockGeoData.height * 2 + 1]

              blockGeoData.blockData.healthRatio = (blockGeoData.blockData.fee / blockGeoData.blockData.outputTotal) * 2000 // 0 == healthy

              this.blockGeoDataObject[blockGeoData.height] = blockGeoData

              this.planeGenerator.updateGeometry(blockGeoData)
              this.treeGenerator.updateGeometry(blockGeoData)
              this.crystalGenerator.updateGeometry(blockGeoData)
              this.crystalAOGenerator.updateGeometry(blockGeoData)
            }
          }
        })

        if (typeof this.blockGeoDataObject[this.closestHeight] === 'undefined') {
          if (this.heightsToLoad.indexOf(this.closestHeight) === -1) {
            this.heightsToLoad.push(this.closestHeight)
          }
        }

        for (let i = 1; i < 10; i++) {
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
              let blockGeoDataTemp = {}
              blockGeoDataTemp.blockData = {}
              blockGeoDataTemp.blockData.height = height
              blockGeoDataTemp.blockData.pos = {}
              blockGeoDataTemp.blockData.pos.x = this.blockPositions[height * 2 + 0]
              blockGeoDataTemp.blockData.pos.z = this.blockPositions[height * 2 + 1]

              this.planeGenerator.updateGeometry(blockGeoDataTemp)
              this.treeGenerator.updateGeometry(blockGeoDataTemp)

              const baseUrl = 'https://us-central1-webgl-gource-1da99.cloudfunctions.net/cors-proxy?url='
              let url = baseUrl + encodeURIComponent('https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)

              let blockData = await window.fetch(url)
              let blockDataJSON = await blockData.json()

              let blockGeoData = await this.getGeometry(blockDataJSON.blocks[0].hash, height)

              if (blockGeoData) {
                if (typeof this.blockGeoDataObject[blockGeoData.height] === 'undefined') {
                  this.crystalGenerator.updateGeometry(blockGeoData)
                  this.crystalAOGenerator.updateGeometry(blockGeoData)
                }
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
          }
        })

        nearestBlocksWorker.terminate()
      }
      nearestBlocksWorker.postMessage({ cmd: 'build', closestHeight: this.closestHeight, config: this.config })

      this.loading = false
      console.log('loaded')
    }
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

  renderFrame () {
    let delta = this.clock.getDelta()

    TWEEN.update()

    if (this.controls) {
      this.controls.update(delta)
    }

    if (this.planetMesh) {
      this.planetMesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), window.performance.now() * 0.00000005)
    }

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

    if (this.picker) {
      this.updatePicker()
    }
    if (this.geoAdded) {
      this.loadNearestBlocks()
    }
    this.getClosestBlock()

    if (this.blockReady) {
      this.setRenderOrder()

      this.diskGenerator.update({time: window.performance.now(), camPos: this.camera.position})
      this.crystalGenerator.update(window.performance.now(), this.firstLoop)
      this.crystalAOGenerator.update(window.performance.now(), this.firstLoop)
      this.treeGenerator.update(window.performance.now() - this.blockAnimStartTime, this.firstLoop)
    }

    this.FilmShaderPass.uniforms.time.value = window.performance.now() * 0.00001

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
      this.crystalAOGenerator.updateBlockStartTimes(blockData)
    })

    document.addEventListener('mousemove', this.onMouseMove.bind(this), false)

    document.addEventListener('mouseup', (e) => {
      if (e.target.className !== 'cockpit-border') {
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

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

    // this.blockAnimStartTime = window.performance.now()

    let indexOffset = this.planeGenerator.blockHeightIndex[this.closestBlock.blockData.height]
    this.originOffset = new THREE.Vector2(
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 0],
      this.plane.geometry.attributes.planeOffset.array[indexOffset + 1]
    )

    this.planetMesh.position.x = 0
    this.planetMesh.position.z = 0
    this.planetMesh.position.x -= this.originOffset.x
    this.planetMesh.position.z -= this.originOffset.y

    this.group.position.x = this.originOffset.x
    this.group.position.z = this.originOffset.y

    this.treeGenerator.updateOriginOffset(this.originOffset)
    this.planeGenerator.updateOriginOffset(this.originOffset)
    this.crystalGenerator.updateOriginOffset(this.originOffset)
    this.crystalAOGenerator.updateOriginOffset(this.originOffset)
    this.diskGenerator.updateOriginOffset(this.originOffset)

    this.createCubeMap(new THREE.Vector3(this.plane.geometry.attributes.planeOffset.array[indexOffset + 0], 2, this.plane.geometry.attributes.planeOffset.array[indexOffset + 1]))

    this.setState({
      closestBlock: this.closestBlock
    })

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

    if (typeof this.audio.buffers[this.closestBlock.blockData.height] === 'undefined') {
      this.audio.generate(this.closestBlock.blockData)
      this.crystalGenerator.updateBlockStartTimes(this.closestBlock.blockData)
      this.crystalAOGenerator.updateBlockStartTimes(this.closestBlock.blockData)
    }

    await this.updateClosestTrees()

    this.updateMerkleDetail(this.closestBlock, 0)
    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height - 1] !== 'undefined') {
      this.updateMerkleDetail(this.blockGeoDataObject[this.closestBlock.blockData.height - 1], 1)
    }
    if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height + 1] !== 'undefined') {
      this.updateMerkleDetail(this.blockGeoDataObject[this.closestBlock.blockData.height + 1], 2)
    }

    this.pickerGenerator.updateGeometry(this.closestBlock)
  }

  async updateClosestTrees () {
    return new Promise(async (resolve, reject) => {
      let centerTree = await this.treeGenerator.get(this.closestBlock.blockData)
      if (this.centerTree) {
        this.group.remove(this.centerTree)
      }
      this.centerTree = centerTree
      this.centerTree.renderOrder = 1
      this.group.add(this.centerTree)

      if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height - 1] !== 'undefined') {
        let lTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height - 1].blockData)
        if (this.lTree) {
          this.group.remove(this.lTree)
        }
        this.lTree = lTree
        this.lTree.renderOrder = 1
        this.group.add(this.lTree)
      }
      if (typeof this.blockGeoDataObject[this.closestBlock.blockData.height + 1] !== 'undefined') {
        let rTree = await this.treeGenerator.get(this.blockGeoDataObject[this.closestBlock.blockData.height + 1].blockData)
        if (this.rTree) {
          this.group.remove(this.rTree)
        }
        this.rTree = rTree
        this.rTree.renderOrder = 1
        this.group.add(this.rTree)
      }

      this.trees.geometry.attributes.display.array.forEach((height, i) => {
        this.trees.geometry.attributes.display.array[i] = 1
      })

      let treeHeight = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height]
      this.trees.geometry.attributes.display.array[treeHeight] = 0

      if (typeof this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height - 1] !== 'undefined') {
        treeHeight = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height - 1]
        this.trees.geometry.attributes.display.array[treeHeight] = 0
      }

      if (typeof this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height + 1] !== 'undefined') {
        treeHeight = this.treeGenerator.indexHeightMap[this.closestBlock.blockData.height + 1]
        this.trees.geometry.attributes.display.array[treeHeight] = 0
      }
      this.trees.geometry.attributes.display.needsUpdate = true

      resolve()
    })
  }

  async updateMerkleDetail (blockGeoData, circuitIndex) {
    let undersidePlane
    let topsidePlane

    switch (circuitIndex) {
      case 0:
        undersidePlane = this.underside
        topsidePlane = this.topside
        break
      case 1:
        undersidePlane = this.undersideL
        topsidePlane = this.topsideL

        break
      case 2:
        undersidePlane = this.undersideR
        topsidePlane = this.topsideR

        break

      default:
        break
    }

    const nTX = Object.keys(blockGeoData.blockData.tx).length
    let undersideTexture = await this.circuit.draw(nTX, blockGeoData)

    let txIndexOffset = this.crystalGenerator.txIndexOffsets[blockGeoData.blockData.height]

    // get rotation
    let quat = new THREE.Quaternion(
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 0],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 1],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 2],
      this.crystal.geometry.attributes.quaternion.array[txIndexOffset * 4 + 3]
    )

    undersideTexture.minFilter = THREE.LinearMipMapLinearFilter

    undersidePlane.material.map = undersideTexture
    undersidePlane.material.needsUpdate = true

    undersidePlane.visible = false
    undersidePlane.rotation.x = 0
    undersidePlane.rotation.y = 0
    undersidePlane.rotation.z = 0
    undersidePlane.position.x = blockGeoData.blockData.pos.x - this.originOffset.x
    undersidePlane.position.z = blockGeoData.blockData.pos.z - this.originOffset.y

    undersidePlane.applyQuaternion(quat)
    undersidePlane.rotateX(Math.PI / 2)
    undersidePlane.updateMatrix()
    undersidePlane.visible = true

    topsidePlane.material.map = undersideTexture
    topsidePlane.material.needsUpdate = true

    topsidePlane.visible = false
    topsidePlane.rotation.x = 0
    topsidePlane.rotation.y = 0
    topsidePlane.rotation.z = 0
    topsidePlane.position.x = blockGeoData.blockData.pos.x - this.originOffset.x
    topsidePlane.position.z = blockGeoData.blockData.pos.z - this.originOffset.y

    topsidePlane.applyQuaternion(quat)
    topsidePlane.rotateX(Math.PI / 2)
    topsidePlane.updateMatrix()
    topsidePlane.visible = true
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
      1000000000
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
    // this.renderer.toneMapping = THREE.NoToneMapping
    // this.renderer.toneMappingExposure = 1.5
    this.renderer.setClearColor(0xffffff, 0)

    // this.renderer.shadowMap.enabled = true
    // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap // default THREE.PCFShadowMap
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

  UICockpitButton () {
    if (this.state.controlType === 'fly') {
      return (
        <button onClick={this.toggleTopView.bind(this)} className='toggle-cockpit-controls enter' />
      )
    } else {
      return (
        <button onClick={this.toggleFlyControls.bind(this)} className='toggle-cockpit-controls leave' />
      )
    }
  }

  UIUndersideButton () {
    if (this.state.controlType !== 'underside') {
      return (
        <div className='flip-view-container'>
          <button onClick={this.toggleUndersideView.bind(this)} className='flip-view' />
        </div>
      )
    } else {
      return (
        <div className='flip-view-container'>
          <button onClick={this.toggleTopView.bind(this)} className='flip-view' />
        </div>
      )
    }
  }

  UITXDetails () {
    if (this.state.txSelected) {
      return (
        <div className='tx-details'>
          <h2>Transaction</h2>
          <ul>
            <li><h3>Date</h3> <strong>{ moment.unix(this.state.txSelected.time).format('MMMM Do YYYY, h:mm:ss a') }</strong></li>
            <li title={this.state.txSelected.hash}><h3>Hash</h3> <strong>{this.state.txSelected.hash.substring(0, 16)}...</strong></li>
            <li><h3>Version</h3> <strong>{this.state.txSelected.ver}</strong></li>
            <li><h3>Size (bytes)</h3> <strong>{this.state.txSelected.size}</strong></li>
            <li><h3>Relayed By</h3> <strong>{this.state.txSelected.relayed_by}</strong></li>
            <li><h3>Inputs</h3> <strong>{this.state.txSelected.vin_sz}</strong></li>
            <li><h3>Outputs</h3> <strong>{this.state.txSelected.vout_sz}</strong></li>
            <li><h3>Input Total</h3> <strong>{this.state.txSelected.inTotal} BTC</strong></li>
            <li><h3>Output Total</h3> <strong>{this.state.txSelected.outTotal} BTC</strong></li>
            <li><h3>Fee</h3> <strong>{this.state.txSelected.fee} BTC</strong></li>
          </ul>
          <ul>
            <li><h3><strong><a target='_blank' href={'https://www.blockchain.com/btc/tx/' + this.state.txSelected.hash}>View Details</a></strong></h3></li>
          </ul>
        </div>
      )
    }
  }

  searchFocus (e) {
    e.target.focus()
  }

  async lookupTXFromHash () {
    try {
      let txData = await window.fetch('https://blockchain.info/rawtx/' + this.state.searchTXHash + '?cors=true&format=json&apiCode=' + this.config.blockchainInfo.apiCode)
      let txDataJSON = await txData.json()

      let posX = this.blockPositions[txDataJSON.block_height * 2 + 0]
      let posZ = this.blockPositions[txDataJSON.block_height * 2 + 1]

      let to = new THREE.Vector3(posX, 10000, posZ)
      let toTarget = new THREE.Vector3(posX, 0, posZ)
      this.prepareCamAnim(
        to,
        toTarget
      )

      this.toggleSidebar()
      this.toggleTxSearch()

      let diff = to.clone().sub(this.camera.position)
      diff.multiplyScalar(0.5)

      let midPoint = this.camera.position.clone().add(diff)
      midPoint.y = 1000000

      let that = this
      new TWEEN.Tween(this.camera.position)
        .to(midPoint, 5000)
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
                .to(new THREE.Vector3(that.camPosTo.x, 500, that.camPosTo.z), 5000)
                .onUpdate(function () {
                  that.camera.position.set(this.x, this.y, this.z)
                })
                .onComplete(() => {
                  that.toggleMapControls()
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
                .easing(TWEEN.Easing.Linear.None)
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
    new TWEEN.Tween(o)
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
        <div className='section explore'>
          <h3>Explore</h3>
          <ul>
            <li>
              <button className='search' onClick={this.toggleSidebar.bind(this)} />
              <span onClick={this.toggleBlockSearch.bind(this)}>Locate Block</span>
              <span onClick={this.toggleTxSearch.bind(this)}>Locate Transaction</span>
            </li>
          </ul>
        </div>
      </div>
    )
  }

  async lookupBlockFromHash () {
    let blockData = await window.fetch('https://blockchain.info/rawblock/' + this.state.searchBlockHash + '?cors=true&apiCode=' + this.config.blockchainInfo.apiCode)

    let blockDataJSON = await blockData.json()

    this.toggleSidebar()

    this.toggleBlockSearch()

    let posX = this.blockPositions[blockDataJSON.height * 2 + 0]
    let posZ = this.blockPositions[blockDataJSON.height * 2 + 1]

    let to = new THREE.Vector3(posX, 10000, posZ)
    let toTarget = new THREE.Vector3(posX, 0, posZ)

    this.prepareCamAnim(to, toTarget)

    let diff = to.clone().sub(this.camera.position)
    diff.multiplyScalar(0.5)

    let midPoint = this.camera.position.clone().add(diff)
    midPoint.y = 1000000

    let that = this
    new TWEEN.Tween(this.camera.position)
      .to(midPoint, 5000)
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
                that.toggleMapControls()
                this.animatingCamera = false
              })
              .easing(TWEEN.Easing.Linear.None)
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
          {this.UIUndersideButton()}
          {this.UITXDetails()}
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
