// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import pickFragmentShader from './shaders/pick.frag'
import pickVertexShader from './shaders/pick.vert'

export default class Picker extends Base {
  constructor (args) {
    super(args)

    this.instanceTotal = 3 * 2000

    this.uTime = 0

    this.material = new THREE.ShaderMaterial({
      depthTest: true,
      transparent: false,
      vertexShader: pickVertexShader,
      fragmentShader: pickFragmentShader
    })

    this.txMap = []
  }

  async init (blockGeoData) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)
    let planeOffsetsArray = new Float32Array(this.instanceTotal * 2).fill(0)
    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)
    this.pickerColorArray = new Float32Array(this.instanceTotal * 3)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.02, 0))
    tubeGeo.vertices[0].sub(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[2].sub(new THREE.Vector3(0, 0.01, 0))
    tubeGeo.vertices[4].sub(new THREE.Vector3(0, 0.01, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)

    // attributes
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let planeOffsets = new THREE.InstancedBufferAttribute(planeOffsetsArray, 2)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    let pickingColors = new THREE.InstancedBufferAttribute(this.pickerColorArray, 3)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    let pickColor = new THREE.Color(0x999999)

    for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
      const tx = blockGeoData.blockData.tx[i]

      pickColor.setHex(i + 1)
      pickingColors.array[i * 3 + 0] = pickColor.r
      pickingColors.array[i * 3 + 1] = pickColor.g
      pickingColors.array[i * 3 + 2] = pickColor.b

      let x = blockGeoData.offsets[i * 2 + 0]
      let y = 0
      let z = blockGeoData.offsets[i * 2 + 1]

      let vector = new THREE.Vector3(x, y, z)

      vector.applyQuaternion(object.quaternion)

      vector.x += blockPosition.x
      vector.z += blockPosition.z

      offsets.array[i * 3 + 0] = vector.x
      offsets.array[i * 3 + 1] = vector.y
      offsets.array[i * 3 + 2] = vector.z

      planeOffsets.array[i * 2 + 0] = blockPosition.x
      planeOffsets.array[i * 2 + 1] = blockPosition.z

      quaternions.array[i * 4 + 0] = object.quaternion.x
      quaternions.array[i * 4 + 1] = object.quaternion.y
      quaternions.array[i * 4 + 2] = object.quaternion.z
      quaternions.array[i * 4 + 3] = object.quaternion.w

      scales.setX(
        i,
        blockGeoData.scales[i]
      )

      let txValue = (tx.value * 0.00000001)
      if (txValue > 1000) {
        txValue = 1000
      }
      if (txValue < 1) {
        txValue = 1
      }

      this.txMap[i] = tx.hash

      offsets.setY(
        i,
        txValue
      )
    }

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('pickerColor', pickingColors)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  async updateGeometry (blockGeoData) {
    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    let pickColor = new THREE.Color(0x999999)

    this.geometry.attributes.offset.array = new Float32Array(this.instanceTotal * 3)
    this.geometry.attributes.planeOffset.array = new Float32Array(this.instanceTotal * 2).fill(0)
    this.geometry.attributes.scale.array = new Float32Array(this.instanceTotal)
    this.geometry.attributes.quaternion.array = new Float32Array(this.instanceTotal * 4)
    this.geometry.attributes.pickerColor.array = new Float32Array(this.instanceTotal * 3)

    for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
      const tx = blockGeoData.blockData.tx[i]

      pickColor.setHex(i + 1)
      this.geometry.attributes.pickerColor.array[i * 3 + 0] = pickColor.r
      this.geometry.attributes.pickerColor.array[i * 3 + 1] = pickColor.g
      this.geometry.attributes.pickerColor.array[i * 3 + 2] = pickColor.b

      let x = blockGeoData.offsets[i * 2 + 0]
      let y = 0
      let z = blockGeoData.offsets[i * 2 + 1]

      let vector = new THREE.Vector3(x, y, z)

      vector.applyQuaternion(object.quaternion)

      vector.x += blockPosition.x
      vector.z += blockPosition.z

      this.geometry.attributes.offset.array[i * 3 + 0] = vector.x
      this.geometry.attributes.offset.array[i * 3 + 1] = vector.y
      this.geometry.attributes.offset.array[i * 3 + 2] = vector.z

      this.geometry.attributes.planeOffset.array[i * 2 + 0] = blockPosition.x
      this.geometry.attributes.planeOffset.array[i * 2 + 1] = blockPosition.z

      this.geometry.attributes.quaternion.array[i * 4 + 0] = object.quaternion.x
      this.geometry.attributes.quaternion.array[i * 4 + 1] = object.quaternion.y
      this.geometry.attributes.quaternion.array[i * 4 + 2] = object.quaternion.z
      this.geometry.attributes.quaternion.array[i * 4 + 3] = object.quaternion.w

      this.geometry.attributes.scale.setX(
        i,
        blockGeoData.scales[i]
      )

      let txValue = (tx.value * 0.00000001)
      if (txValue > 1000) {
        txValue = 1000
      }
      if (txValue < 1) {
        txValue = 1
      }

      this.txMap[i] = tx.hash

      this.geometry.attributes.offset.setY(
        i,
        txValue
      )
    }

    this.geometry.attributes.quaternion.needsUpdate = true
    this.geometry.attributes.planeOffset.needsUpdate = true
    this.geometry.attributes.offset.needsUpdate = true
    this.geometry.attributes.scale.needsUpdate = true
    this.geometry.attributes.pickerColor.needsUpdate = true
  }
}
