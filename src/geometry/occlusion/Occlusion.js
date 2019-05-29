// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/occlusion.frag'
import vertexShader from './shaders/occlusion.vert'

export default class Occlusion extends Base {
  constructor (args) {
    super(args)

    this.instanceTotal = 100

    if (this.config.detector.isMobile) {
      this.instanceTotal = 11
    }

    this.blockHeightIndex = {}
    this.material = new OcclusionMaterial({
      transparent: true
    })
  }

  async init (blockGeoData) {
    this.planeOffsetsArray = new Float32Array(this.instanceTotal * 2)
    this.quatArray = new Float32Array(this.instanceTotal * 4)

    // set up base geometry
    let planeGeo = new THREE.BoxGeometry(this.planeSize + 10, this.planeSize * 0.18, 0.01, 1, 1, 1)
    let planeGeoTop = planeGeo.clone()
    let planeGeoBottom = planeGeo.clone()

    planeGeo.rotateX(Math.PI / 2)
    planeGeo.rotateY(Math.PI / 2)
    planeGeo.translate(-300, -3.00, 0)
    planeGeo.scale(1, 1, 1.1)

    planeGeoTop.rotateX(Math.PI / 2)
    planeGeoTop.scale(1.18, 1, 25.5)
    planeGeoTop.translate(0, -3.00, -1402.5)

    planeGeoBottom.rotateX(Math.PI / 2)
    planeGeoBottom.scale(1.18, 1, 25.5)
    planeGeoBottom.translate(0, -3.00, 1402.5)

    let planeMesh = new THREE.Mesh(planeGeo)
    let planeMeshTop = new THREE.Mesh(planeGeoTop)
    let planeMeshBottom = new THREE.Mesh(planeGeoBottom)

    let singleGeometry = new THREE.Geometry()

    planeMesh.updateMatrix()
    singleGeometry.merge(planeMesh.geometry, planeMesh.matrix)

    planeMeshTop.updateMatrix()
    singleGeometry.merge(planeMeshTop.geometry, planeMeshTop.matrix)

    planeMeshBottom.updateMatrix()
    singleGeometry.merge(planeMeshBottom.geometry, planeMeshBottom.matrix)

    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(singleGeometry)

    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.quatArray[0] = object.quaternion.x
    this.quatArray[1] = object.quaternion.y
    this.quatArray[2] = object.quaternion.z
    this.quatArray[3] = object.quaternion.w

    this.planeOffsetsArray[0] = blockPosition.x
    this.planeOffsetsArray[1] = blockPosition.z

    this.blockHeightIndex[blockGeoData.blockData.height] = 0

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(this.planeOffsetsArray, 2)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    this.index++

    return this.mesh
  }

  async updateGeometry (blockGeoData) {
    if (this.index + 1 > this.instanceTotal) {
      this.index = 0
    }

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.blockHeightIndex[blockGeoData.blockData.height] = this.index * 2

    this.geometry.attributes.quaternion.array[this.index * 4 + 0] = object.quaternion.x
    this.geometry.attributes.quaternion.array[this.index * 4 + 1] = object.quaternion.y
    this.geometry.attributes.quaternion.array[this.index * 4 + 2] = object.quaternion.z
    this.geometry.attributes.quaternion.array[this.index * 4 + 3] = object.quaternion.w
    this.geometry.attributes.quaternion.needsUpdate = true

    this.geometry.attributes.planeOffset.array[this.index * 2 + 0] = blockPosition.x
    this.geometry.attributes.planeOffset.array[this.index * 2 + 1] = blockPosition.z
    this.geometry.attributes.planeOffset.needsUpdate = true
    this.index++
  }
}

class OcclusionMaterial extends THREE.ShaderMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = {}

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
