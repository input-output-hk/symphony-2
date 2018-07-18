// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/plane.frag'
import vertexShader from './shaders/plane.vert'

export default class Plane extends Base {
  constructor (args) {
    super(args)

    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')
    this.normalMap.wrapS = THREE.RepeatWrapping
    this.normalMap.wrapT = THREE.RepeatWrapping
    this.normalMap.repeat.set(4, 4)

    this.material = new PlaneMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x111133,
      metalness: 0.7,
      roughness: 0.3,
      opacity: 0.6,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      // roughnessMap: this.roughnessMap
      // metalnessMap: this.roughnessMap
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.01, 0.01)
    })
  }

  async getMultiple (blockGeoDataArray) {
    this.instanceCount = 0

    let planeOffsetsArray = []
    let quatArray = []

    // set up base geometry
    let planeGeo = new THREE.BoxGeometry(this.planeSize + 10, this.planeSize + 10, 8, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    this.geometry.rotateY(Math.PI / 2)
    this.geometry.translate(0, -4.1, 0)

    for (const hash in blockGeoDataArray) {
      if (blockGeoDataArray.hasOwnProperty(hash)) {
        let blockGeoData = blockGeoDataArray[hash]

        let blockHeight = blockGeoData.blockData.height

        let blockPosition = this.getBlockPosition(blockHeight)

        let object = new THREE.Object3D()
        object.position.set(blockPosition.xOffset, 0, blockPosition.zOffset)
        object.lookAt(0, 0, 0)
        // object.rotateY(1 / (blockHeight + 20))

        quatArray.push(object.quaternion.x)
        quatArray.push(object.quaternion.y)
        quatArray.push(object.quaternion.z)
        quatArray.push(object.quaternion.w)

        planeOffsetsArray.push(blockPosition.xOffset)
        planeOffsetsArray.push(blockPosition.zOffset)
      }
    }

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }
}

class PlaneMaterial extends THREE.MeshStandardMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
