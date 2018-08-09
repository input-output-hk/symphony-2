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
import FXAA from './libs/post/FXAA'
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

// Audio
import Audio from './libs/audio'

// CSS
import './App.css'

class App extends mixin(EventEmitter, Component) {
  constructor (props) {
    super(props)
    this.config = deepAssign(Config, this.props.config)
    this.OrbitControls = OrbitConstructor(THREE)
    this.planeSize = 500
    this.planeOffsetMultiplier = 0
    this.planeMargin = 100
    this.blockReady = false
    this.blockReadyTime = 0
    this.coils = 1000
    this.radius = 100000
    this.ObjectLoader = new THREE.ObjectLoader()
    this.gltfLoader = new GLTFLoader()
    this.blockGeoDataArray = []
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()
    this.merkleYOffset = 0
    this.audio = new Audio()
    this.blockPositions = []
    this.closestBlock = null
    this.prevClosestBlock = null
    this.underside = null
    this.topside = null
    this.closestBlockReadyForUpdate = false
    this.canvas = null
    this.sceneReady = false
    this.shouldDrawUnderside = true
    this.firstLoop = false
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
    // this.ssaaRenderPass.renderToScreen = false
    // this.composer.addPass(this.ssaaRenderPass)

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

    this.FXAAPass = new ShaderPass(FXAA)
    this.FXAAPass.uniforms.resolution.value = new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight)
    this.FXAAPass.renderToScreen = true
    this.composer.addPass(this.FXAAPass)

    // this.ssaaRenderPass = new SSAARenderPass(this.scene, this.camera)
    // this.ssaaRenderPass.renderToScreen = true
    // this.composer.addPass(this.ssaaRenderPass)

    // this.copyPass = new ShaderPass(CopyShader)
    // this.copyPass.renderToScreen = true
    // this.composer.addPass(this.copyPass)

    // this.SMAAPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio())
    // this.SMAAPass.renderToScreen = true
    // this.composer.addPass(this.SMAAPass)
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
          block.tx.forEach((tx) => {
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
          })

          block.outputTotal = outputTotal
          block.tx = transactions
          block.cacheTime = new Date()

          block.pos = this.getBlockPosition(block.height)

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
    this.pointLight = new THREE.PointLight(0xffffff, 0.5, 0, 9999999)
    this.pointLight.position.set(0, 2000, 0)
    this.scene.add(this.pointLight)
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

    this.blockGeoDataArray[parseInt(blockData.height)] = blockGeoData
    this.blockGeoDataArray[parseInt(blockData.height)].blockData = blockData
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
          if (addCount < 5) {
            await this.getGeometry(hash, addCount)
          }

          addCount++
        })

        // let minHeight = Number.MAX_SAFE_INTEGER
        // this.blockGeoDataArray.forEach((blockGeoData, height) => {
        //   minHeight = Math.min(height, minHeight)
        // })

        // this.closestBlock = this.blockGeoDataArray[ minHeight ]

        this.crystal = await this.crystalGenerator.getMultiple(this.blockGeoDataArray)
        this.crystal.renderOrder = 2
        this.scene.add(this.crystal)

        let crystalAO = await this.crystalAOGenerator.getMultiple(this.blockGeoDataArray)
        crystalAO.renderOrder = 2
        crystalAO.translateY(0.1)
        this.scene.add(crystalAO)

        this.plane = await this.planeGenerator.getMultiple(this.blockGeoDataArray)
        this.plane.renderOrder = 2
        this.scene.add(this.plane)

        let quat = new THREE.Quaternion(
          this.plane.geometry.attributes.quaternion.array[0],
          this.plane.geometry.attributes.quaternion.array[1],
          this.plane.geometry.attributes.quaternion.array[2],
          this.plane.geometry.attributes.quaternion.array[3]
        )

        this.trees = await this.treeGenerator.getMultiple(this.blockGeoDataArray)
        this.trees.renderOrder = 1
        this.scene.add(this.trees)

        let planeX = this.plane.geometry.attributes.planeOffset.array[0]
        let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

        // box occluder
        let boxGeo = new THREE.BoxBufferGeometry()
        let boxVertices = new THREE.BufferAttribute(new Float32Array([
          // front
          0.5, 0.5, 0.5,
          0.5, 0.5, -0.5,
          0.5, -0.5, 0.5,
          0.5, -0.5, -0.5,
          // left
          -0.5, 0.5, -0.5,
          -0.5, 0.5, 0.5,
          -0.5, -0.5, -0.5,
          -0.5, -0.5, 0.5,
          // back
          -0.5, 0.5, -0.5,
          0.5, 0.5, -0.5,
          -0.5, 0.5, 0.5,
          0.5, 0.5, 0.5,
          // right
          -0.5, -0.5, 0.5,
          0.5, -0.5, 0.5,
          -0.5, -0.5, -0.5,
          0.5, -0.5, -0.5,
          // bottom
          -0.5, 0.5, 0.5,
          0.5, 0.5, 0.5,
          -0.5, -0.5, 0.5,
          0.5, -0.5, 0.5

        ]), 3)

        let indices = new Uint16Array([
          0, 1, 2,
          2, 1, 3,
          4, 5, 6,
          6, 5, 7,
          8, 9, 10,
          10, 9, 11,
          12, 13, 14,
          14, 13, 15,
          16, 17, 18,
          18, 17, 19
          // 20, 21, 22,
          // 22, 21, 23
        ])

        boxGeo.setIndex(new THREE.BufferAttribute(indices, 1))
        boxGeo.addAttribute('position', boxVertices)

        this.occluder = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xffffff),
          side: THREE.DoubleSide,
          colorWrite: false,
          transparent: true
        }))

        this.occluder.scale.set(509.0, 509.0, 610.0)
        this.occluder.frustumCulled = false

        this.occluder.renderOrder = 1
        this.occluder.translateY(-305.1)
        this.occluder.translateX(planeX)
        this.occluder.translateZ(planeZ)
        this.occluder.applyQuaternion(quat)
        this.occluder.rotateX(Math.PI / 2)
        this.occluder.updateMatrix()
        this.scene.add(this.occluder)

        // this.addClosestBlockDetail()

        this.camera.position.x = planeX + 300
        this.camera.position.z = planeZ - 400

        this.controls.target = new THREE.Vector3(planeX, 0, planeZ)
        this.controls.update()

        // this.emit('blockChanged')
      }.bind(this))
  }

  drawUnderside (nTX) {
    if (this.canvas) {
      this.canvas.parentNode.removeChild(this.canvas)
    }

    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('id', 'sketchboard')
    document.getElementsByTagName('body')[0].appendChild(this.canvas)

    let canvasSize = 2048
    this.canvas.width = canvasSize
    this.canvas.height = canvasSize

    let context = this.canvas.getContext('2d')

    let merklePositions = this.getMerklePositions(nTX)

    let canvasOffset = canvasSize * 0.5
    let scaleFactor = 4.015

    let offsetStack = Array.from(this.closestBlock.offsets)

    for (let index = 0; index < nTX * 2; index += 2) {
      const merkleX = merklePositions[index + 0]
      const merkleZ = merklePositions[index + 1]

      let merkleVec = new THREE.Vector2(merkleX, merkleZ)

      // find closest crystal position
      let closestDist = Number.MAX_SAFE_INTEGER
      let closestDistIndexes = []
      for (let oIndex = 0; oIndex < offsetStack.length; oIndex += 2) {
        let offsetX = offsetStack[oIndex + 0]
        let offsetZ = offsetStack[oIndex + 1]

        if (offsetX === 0 && offsetZ === 0) {
          continue
        }

        const oElement = new THREE.Vector2(offsetX, offsetZ)
        let distSq = oElement.distanceToSquared(merkleVec)

        if (distSq < closestDist) {
          closestDist = distSq
          closestDistIndexes = [oIndex + 0, oIndex + 1]
        }
      }

      if (closestDistIndexes.length && typeof offsetStack[closestDistIndexes[0]] !== 'undefined') {
        let closestOffsetPointX = offsetStack[closestDistIndexes[0]]
        let closestOffsetPointZ = offsetStack[closestDistIndexes[1]]

        offsetStack.splice(closestDistIndexes[0], 1)
        offsetStack.splice(closestDistIndexes[0], 1)

        let scaledOffsetX = closestOffsetPointX * scaleFactor + canvasOffset
        let scaledOffsetZ = closestOffsetPointZ * scaleFactor + canvasOffset

        let scaledMerkleX = merkleX * scaleFactor + canvasOffset
        let scaledMerkleZ = merkleZ * scaleFactor + canvasOffset

        let xEdge = scaledOffsetX - scaledMerkleX
        let zEdge = scaledOffsetZ - scaledMerkleZ
        let shortestEdgeLength = 0
        let shortestEdge = 'X'

        if (Math.abs(xEdge) < Math.abs(zEdge)) {
          shortestEdgeLength = xEdge
        } else {
          shortestEdgeLength = zEdge
          shortestEdge = 'Z'
        }

        let remove = shortestEdgeLength * 0.5

        context.shadowBlur = 25
        context.shadowColor = 'white'

        context.beginPath()
        context.moveTo(scaledMerkleX, scaledMerkleZ)
        context.lineWidth = this.merkleLineWidth
        context.strokeStyle = 'rgba(255,255,255,0.20)'

        if (shortestEdge === 'X') {
          context.lineTo(
            scaledOffsetX - remove,
            scaledMerkleZ
          )

          if (zEdge < 0) {
            remove = Math.abs(remove) * -1
          } else {
            remove = Math.abs(remove)
          }

          context.lineTo(
            scaledOffsetX,
            scaledMerkleZ + remove
          )
          context.lineTo(
            scaledOffsetX,
            scaledOffsetZ
          )
        } else {
          context.lineTo(
            scaledMerkleX,
            scaledOffsetZ - remove
          )

          if (xEdge < 0) {
            remove = Math.abs(remove) * -1
          } else {
            remove = Math.abs(remove)
          }

          context.lineTo(
            scaledMerkleX + remove,
            scaledOffsetZ
          )
          context.lineTo(
            scaledOffsetX,
            scaledOffsetZ
          )
        }
        context.lineJoin = 'round'
        context.stroke()

        context.beginPath()
        context.strokeStyle = 'rgba(255,255,255,0.50)'
        context.arc(scaledMerkleX, scaledMerkleZ, this.merkleNodeRadius, 0, 2 * Math.PI, false)
        context.lineWidth = this.merkleLineWidth + 1.0

        context.stroke()

        context.beginPath()
        context.strokeStyle = 'rgba(255,255,255,0.40)'
        context.arc(scaledOffsetX, scaledOffsetZ, this.merkleNodeRadius, 0, 2 * Math.PI, false)

        context.stroke()
      }
    }

    context.translate(this.canvas.width / 2, this.canvas.height / 2)
    context.scale(-1, 1)
    context.font = '12.5pt Calibri'
    context.lineWidth = 0
    context.fillStyle = 'rgba(255,255,255,0.50)'
    context.fillText('BLOCK #' + this.closestBlock.blockData.height + '  HASH: ' + this.closestBlock.blockData.hash, -1000, -990)
    context.scale(-1, 1)

    context.rotate(Math.PI / 6)

    let texture = new THREE.Texture(this.canvas)
    texture.needsUpdate = true

    return texture
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

  getClosestBlock () {
    this.prevClosestBlock = this.closestBlock
    if (this.blockGeoDataArray.length > 0) {
      let closestDist = Number.MAX_SAFE_INTEGER

      this.blockGeoDataArray.forEach((blockGeoData, height) => {
        const blockPos = new THREE.Vector3(blockGeoData.blockData.pos.x, 0, blockGeoData.blockData.pos.z)
        const blockDist = blockPos.distanceToSquared(this.camera.position)

        this.blockGeoDataArray.dist = blockDist

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
      })

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
    this.controls.update()

    this.getClosestBlock()

    if (this.plane) {
      if (this.camera.position.y < 0) {
        this.plane.renderOrder = 1
      } else {
        this.plane.renderOrder = 2
      }
    }

    // check if camera is inside occluder
    if (this.occluder) {
      // this.occluder.updateMatrixWorld(true)
      let boxMatrixInverse = new THREE.Matrix4().getInverse(this.occluder.matrixWorld)
      let inverseBox = this.occluder.clone()
      // this.camera.updateMatrixWorld()
      // this.camera.updateMatrix()
      let inversePoint = this.camera.position.clone()
      inverseBox.applyMatrix(boxMatrixInverse)
      inversePoint.applyMatrix4(boxMatrixInverse)
      let boundingBox = new THREE.Box3().setFromObject(inverseBox)

      boundingBox.expandByScalar(0.015)
      boundingBox.translate(new THREE.Vector3(0, 0, 0.015))

      if (boundingBox.containsPoint(inversePoint)) {
        this.crystal.visible = false
      } else {
        this.crystal.visible = true
      }
    }

    if (this.blockReady) {
      this.crystalGenerator.update(window.performance.now(), window.performance.now() - this.blockReadyTime, this.firstLoop)
      this.crystalAOGenerator.update(window.performance.now(), window.performance.now() - this.blockReadyTime, this.firstLoop)
    }

    // this.renderer.render(this.scene, this.camera)
    this.composer.render()
  }

  addEvents () {
    window.addEventListener('resize', this.resize.bind(this), false)

    this.on('blockChanged', () => {
      this.addClosestBlockDetail()
    })

    this.resize()
  }

  async addClosestBlockDetail () {
    if (!this.closestBlock) {
      return
    }

    // create new array not including closest block
    this.instanced = []
    this.blockGeoDataArray.forEach((blockGeoData, height) => {
      if (blockGeoData.blockData.hash !== this.closestBlock.blockData.hash) {
        this.instanced[height] = blockGeoData
      }
    })

    let trees = await this.treeGenerator.getMultiple(this.instanced)
    trees.renderOrder = 1
    this.scene.remove(this.trees)
    this.trees = trees
    this.scene.add(this.trees)

    this.scene.remove(this.tree)

    this.tree = await this.treeGenerator.get(this.closestBlock.blockData)
    this.scene.add(this.tree)

    this.audio.audioSources.forEach((src, height) => {
      /*

      src.stop()
      delete this.audio.audioSources[height]
      delete this.audio.buffers[height]
      delete this.audio.gainNodes[height]

      */

      clearTimeout(this.audio.loops[height])
    })

    console.log(this.audio)

    if (typeof this.audio.buffers[this.closestBlock.blockData.height] === 'undefined') {
      this.audio.generate(this.closestBlock.blockData)

      this.audio.on('loopend', () => {
        this.blockReadyTime = window.performance.now()
        this.firstLoop = false
      })
    }

    this.blockReady = true
    this.blockReadyTime = window.performance.now()

    if (this.shouldDrawUnderside) {
      const nTX = Object.keys(this.closestBlock.blockData.tx).length
      let undersideTexture = this.drawUnderside(nTX)

      let minHeight = Number.MAX_SAFE_INTEGER
      this.blockGeoDataArray.forEach((blockGeoData, height) => {
        minHeight = Math.min(height, minHeight)
      })

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

      this.underside.renderOrder = 1

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
      this.topside.renderOrder = 3

      this.topside.translateZ(-0.1)
      this.underside.translateZ(2.1)

      this.scene.add(this.topside)
    }
  }

  initScene () {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(Config.scene.bgColor, Config.scene.fogDensity)

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/saturn/')
      .load([
        'px.png', // right
        'nx.png', // left
        'py.png', // top
        'ny.png', // bottom
        'pz.png', // front
        'nz.png' // back
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
      antialias: false,
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

    this.FXAAPass.uniforms.resolution.value = new THREE.Vector2(1 / window.innerWidth, 1 / window.innerHeight)

    this.composer.setSize(this.width, this.height)
  }

  render () {
    return (
      <div className='symphony'>
        <canvas width={this.config.scene.width} height={this.config.scene.height} id={this.config.scene.canvasID} />
      </div>
    )
  }

  getMerklePositions (nTX) {
    nTX--
    nTX |= nTX >> 1
    nTX |= nTX >> 2
    nTX |= nTX >> 4
    nTX |= nTX >> 8
    nTX |= nTX >> 16
    nTX++

    console.log(nTX)

    let merkleMap = {
      4096: 13,
      2048: 12,
      1024: 11,
      512: 10,
      256: 9,
      128: 8,
      64: 7,
      32: 6,
      16: 5,
      8: 4,
      4: 3,
      2: 2,
      1: 1,
      0: 1
    }

    let merkleYOffsetMap = {
      4096: 71.4,
      2048: 4.1,
      1024: 72.3,
      512: 73.3,
      256: 75,
      128: 78,
      64: 82,
      32: 90,
      16: 102,
      8: 122,
      4: 155,
      2: 212,
      1: 212,
      0: 212
    }

    let merkleLineWidthMap = {
      4096: 0.4,
      2048: 0.525,
      1024: 0.65,
      512: 1.15,
      256: 0.9,
      128: 1.15,
      64: 1.4,
      32: 2.4,
      16: 2.9,
      8: 3.4,
      4: 4.025,
      2: 4.4,
      1: 4.9,
      0: 4.9
    }

    let merkleNodeRadiusMap = {
      4096: 1.5,
      2048: 1.25,
      1024: 1.325,
      512: 1.325,
      256: 2.2,
      128: 2.95,
      64: 3.45,
      32: 3.95,
      16: 4.45,
      8: 4.9,
      4: 5.2,
      2: 6.95,
      1: 6.9,
      0: 6.9
    }

    this.merkleYOffset = merkleYOffsetMap[nTX]
    this.merkleLineWidth = merkleLineWidthMap[nTX]
    this.merkleNodeRadius = merkleNodeRadiusMap[nTX]

    let positions = require('./data/merkle-' + merkleMap[nTX])

    return positions
  }
}

export default App
