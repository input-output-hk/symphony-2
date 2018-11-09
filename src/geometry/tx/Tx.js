// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/tx.frag'
import vertexShader from './shaders/tx.vert'

export default class Tx extends Base {
  constructor (args) {
    super(args)

    this.instanceTotal = 10000

    this.material = new TxMaterial({
      flatShading: true,
      color: 0x869cff,
      transparent: true
    })
  }

  async init (blockPositions, height) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)
    this.quatArray = new Float32Array(this.instanceTotal * 4)

    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)

    // set up base geometry
    let coneGeo = new THREE.ConeGeometry(10, 25000, 3)
    let coneBufferGeo = new THREE.BufferGeometry().fromGeometry(coneGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(coneBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    this.geometry.rotateY(Math.PI)

    let maxHeight = (blockPositions.length / 2) - 1

    for (let index = 1; index < this.instanceTotal; index++) {
      let randHeight = Math.floor(Math.random() * maxHeight)

      let x = blockPositions[randHeight * 2 + 0]
      let y = 0
      let z = blockPositions[randHeight * 2 + 1]

      this.offsetsArray[index * 3 + 0] = x
      this.offsetsArray[index * 3 + 1] = 400 + Math.random() * 1700
      this.offsetsArray[index * 3 + 2] = z

      let object = new THREE.Object3D()
      object.position.set(x, 0, z)
      object.lookAt(0, 0, 0)

      let vector = new THREE.Vector3(x, y, z)

      vector.applyQuaternion(object.quaternion)

      vector.x += x
      vector.z += z

      quaternions.array[index * 4 + 0] = object.quaternion.x
      quaternions.array[index * 4 + 1] = object.quaternion.y
      quaternions.array[index * 4 + 2] = object.quaternion.z
      quaternions.array[index * 4 + 3] = object.quaternion.w
    }

    // attributes
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('quaternion', quaternions)

    let topVertex = [
      1, 1, 0,
      1, 1, 0,
      1, 1, 0,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

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
      0, 0, 0
    ]

    const TVArray = new Float32Array(topVertex)
    const TVAttribute = new THREE.BufferAttribute(TVArray, 1)
    this.geometry.addAttribute('topVertex', TVAttribute)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  update (time) {
    this.material.uniforms.uTime.value = time
  }
}

class TxMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
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
