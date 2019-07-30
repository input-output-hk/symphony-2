// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/crystal.frag'
import vertexShader from './shaders/crystal.vert'

export default class Crystal extends Base {
  constructor (args) {
    super(args)

    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')

    this.normalMap.minFilter = THREE.NearestFilter
    this.instanceTotal = 9 * 4000

    if (this.config.scene.mode === 'lite') {
      this.instanceTotal = 5 * 4000
    }
    
    if (this.config.detector.isMobile) {
      this.instanceTotal = 3 * 4000
    }

    this.txCount = 0
    this.txIndexOffsets = {}

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa-full/')
      .load([
        '0004.jpg',
        '0002.jpg',
        '0006.jpg',
        '0005.jpg',
        '0001.jpg',
        '0003.jpg'
      ])

    this.material = new CrystalMaterial({
      flatShading: true,
      opacity: 1.0,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 1.0,
      roughness: 0.2,
      transparent: true,
      side: THREE.FrontSide,
      envMap: this.cubeMap,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.01, 0.01),
      roughnessMap: this.roughnessMap
    })
  }

  async init (blockGeoData) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)
    this.offsetsArray2D = new Float32Array(this.instanceTotal * 2)
    this.txValuesArray = new Float32Array(this.instanceTotal)

    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)
    this.isHovered = new Float32Array(this.instanceTotal)
    this.isSelected = new Float32Array(this.instanceTotal)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[0].add(new THREE.Vector3(0, 0.02, 0))
    tubeGeo.vertices[1].add(new THREE.Vector3(0, 0.02, 0))
    tubeGeo.vertices[2].add(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[4].sub(new THREE.Vector3(0, 0.01, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)

    // attributes
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    let isHovered = new THREE.InstancedBufferAttribute(this.isHovered, 1)
    let isSelected = new THREE.InstancedBufferAttribute(this.isSelected, 1)
    let blockStartTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let blockLoadTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      offsets,
      quaternions,
      scales,
      this.txValuesArray,
      spentRatios,
      txTimes,
      this.offsetsArray2D
    )

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('txTime', txTimes)
    this.geometry.addAttribute('blockStartTime', blockStartTimes)
    this.geometry.addAttribute('blockLoadTime', blockLoadTimes)
    this.geometry.addAttribute('isHovered', isHovered)
    this.geometry.addAttribute('isSelected', isSelected)

    const positionAttrib = this.geometry.getAttribute('position')

    let barycentric = []

    // for each triangle in the geometry, add the barycentric coordinates
    for (let i = 0; i < positionAttrib.count / 3; i++) {
      if (
        i === 23 ||
        i === 22 ||
        i === 21 ||
        i === 20 ||
        i === 19 ||
        i === 18 ||
        i === 17 ||
        i === 16 ||
        i === 15 ||
        i === 14 ||
        i === 13 ||
        i === 12
      ) {
        barycentric.push(
          0, 0, 0,
          0, 0, 0,
          0, 0, 0
        )
      } else if (i % 2 === 0) {
        barycentric.push(
          0, 0, 1,
          0, 1, 0,
          1, 0, 1
        )
      } else {
        barycentric.push(
          0, 1, 0,
          0, 0, 1,
          1, 0, 1
        )
      }
    }

    const array = new Float32Array(barycentric)
    const attribute = new THREE.BufferAttribute(array, 3)
    this.geometry.addAttribute('barycentric', attribute)

    let centerTopVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const CTVArray = new Float32Array(centerTopVertex)
    const CTVAttribute = new THREE.BufferAttribute(CTVArray, 1)
    this.geometry.addAttribute('centerTopVertex', CTVAttribute)

    let centerBottomVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1

    ]

    const CBVArray = new Float32Array(centerBottomVertex)
    const CBVAttribute = new THREE.BufferAttribute(CBVArray, 1)
    this.geometry.addAttribute('centerBottomVertex', CBVAttribute)

    let topVertex = [
      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const TVArray = new Float32Array(topVertex)
    const TVAttribute = new THREE.BufferAttribute(TVArray, 1)
    this.geometry.addAttribute('topVertex', TVAttribute)

    this.txCount += blockGeoData.blockData.n_tx

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  updateBlockStartTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.n_tx; i++) {
      this.geometry.attributes.blockStartTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockStartTime.needsUpdate = true
  }

  updateBlockLoadTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.n_tx; i++) {
      this.geometry.attributes.blockLoadTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockLoadTime.needsUpdate = true
  }

  updateGeometry (blockGeoData) {
    if (this.txCount + blockGeoData.blockData.n_tx > this.instanceTotal) {
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
      this.geometry.attributes.quaternion,
      this.geometry.attributes.scale,
      this.txValuesArray,
      this.geometry.attributes.spentRatio,
      this.geometry.attributes.txTime,
      this.offsetsArray2D
    )

    this.txCount += blockGeoData.blockData.n_tx

    this.updateBlockStartTimes(blockGeoData.blockData)
    this.updateBlockLoadTimes(blockGeoData.blockData)
  }

  update (args) {
    this.material.uniforms.uIsMobile.value = this.config.detector.isMobile ? 1.0 : 0.0
    this.material.uniforms.uTime.value = args.time
    this.material.uniforms.uAudioTime.value = args.time
    this.material.uniforms.uCamPos.value = args.camPos
    this.material.uniforms.uCamPosYPositive.value = args.camPos.y > 1
    this.material.uniforms.uAutoPilot.value = args.autoPilot
  }
}

class CrystalMaterial extends THREE.MeshStandardMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uIsMobile = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uAutoPilot = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uCamPos = {
      type: 'v3',
      value: new THREE.Vector3(0.0, 0.0, 0.0)
    }

    this.uniforms.uCamPosYPositive = {
      type: 'f',
      value: 1.0
    }

    this.uniforms.uAudioTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
