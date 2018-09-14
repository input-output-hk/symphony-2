// libs
import * as THREE from 'three'

import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/crystalAO.frag'
import vertexShader from './shaders/crystalAO.vert'

export default class CrystalAO extends Base {
  constructor (args) {
    super(args)
    this.firebaseDB = args.firebaseDB
    this.docRefGeo = this.firebaseDB.collection('blocks_geometry')
    this.map = new THREE.TextureLoader().load('assets/images/textures/ao-hexagon.png')

    this.material = new CrystalAOMaterial({
      // flatShading: true,
      // color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
      map: this.map,
      opacity: 0.3,
      depthTest: true,
      depthWrite: false
    })

    this.txIndexOffsets = {}
    this.instanceTotal = 20 * 3000
    this.txCount = 0
  }

  async init (blockGeoData) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)
    let planeOffsetsArray = new Float32Array(this.instanceTotal * 2).fill(0)
    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)

    this.geometry.rotateX(Math.PI / 2)

    // attributes
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let planeOffsets = new THREE.InstancedBufferAttribute(planeOffsetsArray, 2)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    let blockStartTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      offsets,
      planeOffsets,
      quaternions,
      scales,
      txValues,
      spentRatios,
      txTimes
    )

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('txTime', txTimes)
    this.geometry.addAttribute('blockStartTime', blockStartTimes)

    this.txCount += blockGeoData.blockData.tx.length

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  update (time, firstLoop) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uAudioTime.value = time
    this.material.uniforms.uFirstLoop.value = firstLoop
  }

  async updateGeometry (blockGeoData) {
    if (this.txCount + blockGeoData.blockData.tx.length > this.instanceTotal) {
      this.txCount = 0
    }

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      this.geometry.attributes.offset,
      this.geometry.attributes.planeOffset,
      this.geometry.attributes.quaternion,
      this.geometry.attributes.scale,
      this.geometry.attributes.txValue,
      this.geometry.attributes.spentRatio,
      this.geometry.attributes.txTime
    )

    this.txCount += blockGeoData.blockData.tx.length
  }
}

class CrystalAOMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uFirstLoop = {
      type: 'f',
      value: 1.0
    }

    this.uniforms.uAudioTime = {
      type: 'f',
      value: 0.0
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
