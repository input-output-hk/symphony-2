// libs
import * as THREE from 'three'
import GLTFLoader from 'three-gltf-loader'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/tree.frag'
import vertexShader from './shaders/tree.vert'

export default class Tree extends Base {
  constructor (args) {
    super(args)
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')
    this.gltfLoader = new GLTFLoader()

    this.instanceTotal = 100

    if (this.config.detector.isMobile) {
      this.instanceTotal = 20
    }

    if (this.config.scene.mode === 'lite') {
      this.instanceTotal = 20
    }

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa-full/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.merkleMap = {
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
      1: 2
    }

    this.material = new TreeMaterial({
      color: 0xcccccc,
      emissive: 0x000000,
      metalness: 0.8,
      roughness: 0.2,
      opacity: 1.0,
      transparent: true,

      envMap: this.cubeMap,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.03, 0.03)
    })

    this.materialC = this.material.clone()
    this.materialL = this.material.clone()
    this.materialR = this.material.clone()

    this.indexHeightMap = {}

    this.index = 0

    this.loadedModels = {}

    this.loadedMeshes = {}

    this.preLoadMeshes()
  }

  async preLoadMeshes () {
    for (let i = 0; i < 3; i++) {
      this.loadedMeshes[i] = {}
      for (const nTX in this.merkleMap) {
        if (this.merkleMap.hasOwnProperty(nTX)) {
          let blockData = {}
          blockData.n_tx = nTX
          blockData.pos = new THREE.Vector3(0, 0, 0)
          this.loadedMeshes[i][nTX] = await this.build(blockData)
        }
      }
    }
  }

  async loadTreeModel (nTX) {
    return new Promise(async (resolve, reject) => {
      nTX--
      nTX |= nTX >> 1
      nTX |= nTX >> 2
      nTX |= nTX >> 4
      nTX |= nTX >> 8
      nTX |= nTX >> 16
      nTX++

      // if (typeof this.loadedModels[merkleMap[nTX]] !== 'undefined') {
      //   resolve(this.loadedModels[merkleMap[nTX]])
      // }

      // Load a glTF resource
      await this.gltfLoader.load(
        'assets/models/gltf/binary-tree-' + this.merkleMap[nTX] + '.gltf',
        function (gltf) {
          let treeMesh = gltf.scene.children[0]

          let tubeGeo = new THREE.CylinderGeometry(6, 6, 600, 6)
          let tubeMesh = new THREE.Mesh(tubeGeo)
          tubeMesh.rotateZ(Math.PI / 2)
          tubeMesh.translateY(-295)

          let singleGeometry = new THREE.Geometry()
          tubeMesh.updateMatrix()
          singleGeometry.merge(tubeMesh.geometry, tubeMesh.matrix)
          treeMesh.updateMatrix()
          let treeGeo = new THREE.Geometry().fromBufferGeometry(treeMesh.geometry)
          singleGeometry.merge(treeGeo, treeMesh.matrix)
          let bufferGeo = new THREE.BufferGeometry().fromGeometry(singleGeometry)
          let geometry = new THREE.InstancedBufferGeometry().copy(bufferGeo)

          geometry.computeVertexNormals()
          geometry.translate(0, -382.5, 0)

          // this.loadedModels[merkleMap[nTX]] = geometry

          resolve(geometry)
        },
        function () {},
        function (error) {
          console.log('An error occurred')
          reject(new Error(error))
        }
      )
    })
  }

  async init (blockGeoData, nTXOverride) {
    // let planeOffsetsArray = new Float32Array(this.instanceTotal * 2).fill(99999999)
    let planeOffsetsArray = new Float32Array(this.instanceTotal * 2)
    let quatArray = new Float32Array(this.instanceTotal * 4)

    // set up base geometry
    let nTX = blockGeoData.blockData.n_tx
    if (nTX > 128) {
      nTX = 128
    }

    if (nTXOverride) {
      nTX = nTXOverride
    }

    let geometry = await this.loadTreeModel(nTX)
    this.geometry = geometry.clone()

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    quatArray[0] = object.quaternion.x
    quatArray[1] = object.quaternion.y
    quatArray[2] = object.quaternion.z
    quatArray[3] = object.quaternion.w

    planeOffsetsArray[0] = blockPosition.x
    planeOffsetsArray[1] = blockPosition.z

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(planeOffsetsArray, 2)
    let quaternions = new THREE.InstancedBufferAttribute(quatArray, 4)
    let display = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal).fill(0), 1)

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('display', display)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    this.indexHeightMap[blockGeoData.blockData.height] = this.index

    // this.index++

    return this.mesh
  }

  async updateGeometry (blockGeoData) {
    if (this.index + 1 > this.instanceTotal) {
      this.index = 0
    }
    let blockPosition = blockGeoData.blockData.pos

    this.indexHeightMap[blockGeoData.blockData.height] = this.index

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.geometry.attributes.quaternion.array[this.index * 4 + 0] = object.quaternion.x
    this.geometry.attributes.quaternion.array[this.index * 4 + 1] = object.quaternion.y
    this.geometry.attributes.quaternion.array[this.index * 4 + 2] = object.quaternion.z
    this.geometry.attributes.quaternion.array[this.index * 4 + 3] = object.quaternion.w
    this.geometry.attributes.quaternion.needsUpdate = true

    this.geometry.attributes.planeOffset.array[this.index * 2 + 0] = blockPosition.x
    this.geometry.attributes.planeOffset.array[this.index * 2 + 1] = blockPosition.z
    this.geometry.attributes.planeOffset.needsUpdate = true

    this.geometry.attributes.display.array[this.index] = 1
    this.geometry.attributes.display.needsUpdate = true

    this.index++
  }

  update (time, firstLoop) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uFirstLoop.value = firstLoop
  }

  async build (blockData) {
    let planeOffsetsArray = new Float32Array(2)
    let quatArray = new Float32Array(4)

    let nTX = blockData.n_tx

    nTX--
    nTX |= nTX >> 1
    nTX |= nTX >> 2
    nTX |= nTX >> 4
    nTX |= nTX >> 8
    nTX |= nTX >> 16
    nTX++

    // set up base geometry
    let geometry

    if (typeof this.loadedModels[this.merkleMap[nTX]] !== 'undefined') {
      geometry = this.loadedModels[this.merkleMap[nTX]].clone()
    } else {
      let geometryTemp = await this.loadTreeModel(blockData.n_tx)
      geometry = geometryTemp.clone()
      this.loadedModels[this.merkleMap[nTX]] = geometry
    }

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(planeOffsetsArray, 2)
    let quaternions = new THREE.InstancedBufferAttribute(quatArray, 4)
    let display = new THREE.InstancedBufferAttribute(new Float32Array(1).fill(1), 1)

    geometry.addAttribute('planeOffset', planeOffsets)
    geometry.addAttribute('quaternion', quaternions)
    geometry.addAttribute('display', display)

    let mesh = new THREE.Mesh(geometry, this.material)

    mesh.frustumCulled = false
    return mesh
  }

  /**
   * Get a single tree mesh based on block data
   *
   * @param {*} blockData
   */
  async get (blockData, index) {
    let nTX = blockData.n_tx

    nTX--
    nTX |= nTX >> 1
    nTX |= nTX >> 2
    nTX |= nTX >> 4
    nTX |= nTX >> 8
    nTX |= nTX >> 16
    nTX++

    let treeMesh = this.loadedMeshes[index][nTX]

    let planeOffsetsArray = treeMesh.geometry.attributes.planeOffset.array
    let quatArray = treeMesh.geometry.attributes.quaternion.array

    let blockPosition = blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    quatArray[0] = object.quaternion.x
    quatArray[1] = object.quaternion.y
    quatArray[2] = object.quaternion.z
    quatArray[3] = object.quaternion.w

    planeOffsetsArray[0] = blockPosition.x
    planeOffsetsArray[1] = blockPosition.z

    treeMesh.geometry.attributes.planeOffset.needsUpdate = true
    treeMesh.geometry.attributes.quaternion.needsUpdate = true

    return treeMesh
  }
}

class TreeMaterial extends THREE.MeshStandardMaterial {
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

    this.uniforms.uFirstLoop = {
      type: 'f',
      value: 1.0
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
