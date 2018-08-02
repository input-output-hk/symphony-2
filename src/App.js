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
/// import FXAA from './libs/post/FXAA'
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
    this.coils = 100
    this.radius = 1000000
    this.ObjectLoader = new THREE.ObjectLoader()
    this.gltfLoader = new GLTFLoader()
    this.blockGeoDataArray = {}
    this.hashes = []
    this.timestampToLoad = this.setTimestampToLoad()
    this.merkleYOffset = 0
    this.audio = new Audio()
  }

  componentDidMount () {
    this.initStage()
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
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.3, 0.97)
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

    // this.ssaaRenderPass = new SSAARenderPass(this.scene, this.camera)
    // this.ssaaRenderPass.renderToScreen = true
    // this.composer.addPass(this.ssaaRenderPass)

    // this.copyPass = new ShaderPass(CopyShader)
    // this.copyPass.renderToScreen = true
    // this.composer.addPass(this.copyPass)

    this.SMAAPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio())
    this.SMAAPass.renderToScreen = true
    this.composer.addPass(this.SMAAPass)
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

    this.blockGeoDataArray[hash] = blockGeoData
    this.blockGeoDataArray[hash].blockData = blockData
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
            await this.getGeometry(hash, addCount)
          }

          addCount++
        })

        let nTX = 0
        for (const key in this.blockGeoDataArray) {
          if (this.blockGeoDataArray.hasOwnProperty(key)) {
            const blockGeoData = this.blockGeoDataArray[key]

            nTX = Object.keys(blockGeoData.blockData.tx).length
            break
          }
        }
        let undersideTexture = this.drawUnderside(nTX)

        // audio
        let blockGeoData
        for (const key in this.blockGeoDataArray) {
          if (this.blockGeoDataArray.hasOwnProperty(key)) {
            blockGeoData = this.blockGeoDataArray[key]
            break
          }
        }

        this.audio.generate(blockGeoData.blockData)

        this.audio.on('loopend', () => {
          this.blockReadyTime = window.performance.now()
          this.firstLoop = false
        })

        this.firstLoop = true
        this.blockReady = true
        this.blockReadyTime = window.performance.now()

        this.crystal = await this.crystalGenerator.getMultiple(this.blockGeoDataArray, this.audio.times)
        this.crystal.renderOrder = 2
        this.scene.add(this.crystal)

        let crystalAO = await this.crystalAOGenerator.getMultiple(this.blockGeoDataArray, this.audio.times)
        crystalAO.renderOrder = 2
        crystalAO.translateY(0.1)
        this.scene.add(crystalAO)

        this.plane = await this.planeGenerator.getMultiple(this.blockGeoDataArray, undersideTexture)
        // this.plane.renderOrder = 2
        this.scene.add(this.plane)

        let quat = new THREE.Quaternion(
          this.plane.geometry.attributes.quaternion.array[0],
          this.plane.geometry.attributes.quaternion.array[1],
          this.plane.geometry.attributes.quaternion.array[2],
          this.plane.geometry.attributes.quaternion.array[3]
        )

        let tree = await this.treeGenerator.getMultiple(this.blockGeoDataArray)
        tree.renderOrder = 1
        this.scene.add(tree)

        let planeX = this.plane.geometry.attributes.planeOffset.array[0]
        let planeZ = this.plane.geometry.attributes.planeOffset.array[1]

        undersideTexture.minFilter = THREE.LinearMipMapLinearFilter
        let undersideGeometry = new THREE.PlaneBufferGeometry(this.planeSize + 10, this.planeSize + 10, 1)
        let undersideMaterial = new THREE.MeshBasicMaterial({
          // side: THREE.DoubleSide,
          transparent: true,
          map: undersideTexture
        })
        let underside = new THREE.Mesh(undersideGeometry, undersideMaterial)
        underside.frustumCulled = false

        underside.renderOrder = 1

        underside.translateX(planeX)
        underside.translateZ(planeZ)
        underside.applyQuaternion(quat)
        underside.rotateX(Math.PI / 2)
        underside.scale.set(1.0, -1.0, 1.0)

        underside.updateMatrix()

        this.scene.add(underside)

        let topsideMaterial = new THREE.MeshStandardMaterial({
          side: THREE.BackSide,
          transparent: true,
          map: undersideTexture,
          bumpMap: undersideTexture
        })
        let topside = underside.clone()
        topside.material = topsideMaterial
        topside.renderOrder = 3

        topside.translateZ(-0.1)
        underside.translateZ(2.1)

        this.scene.add(topside)

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
        // boxGeo.addAttribute('uv', uvs)

        // let boxGeo = new THREE.BoxBufferGeometry(510, 510, 510)
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

        this.camera.position.x = planeX + 300
        this.camera.position.z = planeZ - 400

        this.controls.target = new THREE.Vector3(planeX, 0, planeZ)
        this.controls.update()
      }.bind(this))
  }

  drawUnderside (nTX) {
    let canvas = document.getElementById('sketchboard')
    let context = canvas.getContext('2d')

    let merklePositions = this.getMerklePositions(nTX)

    let canvasSize = 4096
    let canvasOffset = canvasSize / 2
    let scaleFactor = 8.03

    let blockGeoData
    for (const key in this.blockGeoDataArray) {
      if (this.blockGeoDataArray.hasOwnProperty(key)) {
        blockGeoData = this.blockGeoDataArray[key]

        let offsetStack = JSON.parse(JSON.stringify(Array.from(blockGeoData.offsets)))

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
            let closestOffsetPointX = JSON.parse(JSON.stringify(offsetStack[closestDistIndexes[0]]))
            let closestOffsetPointZ = JSON.parse(JSON.stringify(offsetStack[closestDistIndexes[1]]))

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

            let remove = shortestEdgeLength / 2

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
      }
    }

    context.translate(canvas.width / 2, canvas.height / 2)
    context.scale(-1, 1)
    context.font = '25pt Calibri'
    context.lineWidth = 0
    context.fillStyle = 'rgba(255,255,255,0.50)'
    context.fillText('BLOCK #' + blockGeoData.blockData.height + '  HASH: ' + blockGeoData.blockData.hash, -2000, -1980)
    context.scale(-1, 1)

    context.rotate(Math.PI / 6)

    let texture = new THREE.Texture(canvas)
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

  renderFrame () {
    this.controls.update()

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
    this.resize()
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

    this.composer.setSize(this.width, this.height)
  }

  render () {
    return (
      <div className='symphony'>
        <canvas width={this.config.scene.width} height={this.config.scene.height} id={this.config.scene.canvasID} />
        <canvas width='4096' height='4096' id='sketchboard' />
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
      4096: 1.0,
      2048: 1.25,
      1024: 1.5,
      512: 2.5,
      256: 2.0,
      128: 2.5,
      64: 3.0,
      32: 5.0,
      16: 6.0,
      8: 7.0,
      4: 8.25,
      2: 9.0,
      1: 10.0,
      0: 10.0
    }

    let merkleNodeRadiusMap = {
      4096: 4.0,
      2048: 5.0,
      1024: 5.5,
      512: 5.5,
      256: 9.0,
      128: 12.0,
      64: 14.0,
      32: 16.0,
      16: 18.0,
      8: 20.0,
      4: 23.0,
      2: 24.0,
      1: 25.0,
      0: 25.0
    }

    this.merkleYOffset = merkleYOffsetMap[nTX]
    this.merkleLineWidth = merkleLineWidthMap[nTX]
    this.merkleNodeRadius = merkleNodeRadiusMap[nTX]

    let positions = require('./data/merkle-' + merkleMap[nTX])

    return positions
  }
}

export default App
