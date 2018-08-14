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
    this.material = new TreeMaterial({
      // flatShading: true,
      color: 0xffffff,
      // color: 0x87ffd9,
      emissive: 0x000000,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      // side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      /* roughnessMap: this.roughnessMap,
      metalnessMap: this.roughnessMap, */
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.03, 0.03)
    })
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
        1: 2
      }

      // Load a glTF resource
      this.binaryTree = await this.gltfLoader.load(
        'assets/models/gltf/binary-tree-' + merkleMap[nTX] + '.gltf',
        function (gltf) {
          let mesh = gltf.scene.children[0]
          resolve(mesh)
        },
        function () {},
        function (error) {
          console.log('An error happened')
          reject(new Error(error))
        }
      )
    })
  }

  async init (blockGeoData) {
    let planeOffsetsArray = new Float32Array(this.instanceTotal * 2)
    let quatArray = new Float32Array(this.instanceTotal * 4)

    // set up base geometry
    let treeMesh = await this.loadTreeModel(Object.keys(blockGeoData.blockData.tx).length)

    let tubeGeo = new THREE.CylinderGeometry(6, 6, 600, 6)
    let tubeMesh = new THREE.Mesh(tubeGeo)
    tubeMesh.rotateZ(Math.PI / 2)

    let singleGeometry = new THREE.Geometry()
    tubeMesh.updateMatrix()
    singleGeometry.merge(tubeMesh.geometry, tubeMesh.matrix)
    treeMesh.updateMatrix()
    let treeGeo = new THREE.Geometry().fromBufferGeometry(treeMesh.geometry)
    singleGeometry.merge(treeGeo, treeMesh.matrix)
    let bufferGeo = new THREE.BufferGeometry().fromGeometry(singleGeometry)
    this.geometry = new THREE.InstancedBufferGeometry().copy(bufferGeo)

    this.geometry.computeVertexNormals()
    this.geometry.translate(0, -383.0, 0)

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

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  async updateGeometry (blockGeoData, index) {
    console.log('update ', index)

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.geometry.attributes.quaternion.array[index * 4 + 0] = object.quaternion.x
    this.geometry.attributes.quaternion.array[index * 4 + 1] = object.quaternion.y
    this.geometry.attributes.quaternion.array[index * 4 + 2] = object.quaternion.z
    this.geometry.attributes.quaternion.array[index * 4 + 3] = object.quaternion.w
    this.geometry.attributes.quaternion.needsUpdate = true

    this.geometry.attributes.planeOffset.array[index * 2 + 0] = blockPosition.x
    this.geometry.attributes.planeOffset.array[index * 2 + 1] = blockPosition.z
    this.geometry.attributes.planeOffset.needsUpdate = true
  }

  async removeClosest (blockGeoData, closestIndex, prevClosestIndex) {
    console.log('remove ', closestIndex)

    this.geometry.attributes.quaternion.array[closestIndex * 4 + 0] = 0
    this.geometry.attributes.quaternion.array[closestIndex * 4 + 1] = 0
    this.geometry.attributes.quaternion.array[closestIndex * 4 + 2] = 0
    this.geometry.attributes.quaternion.array[closestIndex * 4 + 3] = 0
    this.geometry.attributes.quaternion.needsUpdate = true

    this.geometry.attributes.planeOffset.array[closestIndex * 2 + 0] = 0
    this.geometry.attributes.planeOffset.array[closestIndex * 2 + 1] = 0
    this.geometry.attributes.planeOffset.needsUpdate = true

    await this.updateGeometry(blockGeoData, prevClosestIndex)
  }

  /**
   * Get a single tree mesh based on block data
   *
   * @param {*} blockData
   */
  async get (blockData) {
    let planeOffsetsArray = []
    let quatArray = []

    // set up base geometry
    let treeMesh = await this.loadTreeModel(Object.keys(blockData.tx).length)

    let tubeGeo = new THREE.CylinderGeometry(6, 6, 600, 6)
    let tubeMesh = new THREE.Mesh(tubeGeo)
    tubeMesh.rotateZ(Math.PI / 2)

    let singleGeometry = new THREE.Geometry()
    tubeMesh.updateMatrix()
    singleGeometry.merge(tubeMesh.geometry, tubeMesh.matrix)
    treeMesh.updateMatrix()
    let treeGeo = new THREE.Geometry().fromBufferGeometry(treeMesh.geometry)
    singleGeometry.merge(treeGeo, treeMesh.matrix)
    let bufferGeo = new THREE.BufferGeometry().fromGeometry(singleGeometry)
    let geometry = new THREE.InstancedBufferGeometry().copy(bufferGeo)

    geometry.computeVertexNormals()
    geometry.translate(0, -383.0, 0)

    let blockPosition = blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    quatArray.push(object.quaternion.x)
    quatArray.push(object.quaternion.y)
    quatArray.push(object.quaternion.z)
    quatArray.push(object.quaternion.w)

    planeOffsetsArray.push(blockPosition.x)
    planeOffsetsArray.push(blockPosition.z)

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)

    geometry.addAttribute('planeOffset', planeOffsets)
    geometry.addAttribute('quaternion', quaternions)

    let mesh = new THREE.Mesh(geometry, this.material)

    mesh.frustumCulled = false

    return mesh
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

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
