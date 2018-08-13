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

  async getMultiple (blockGeoDataArray) {
    let blockHeightsArray = []
    let planeOffsetsArray = []
    let quatArray = []

    // let nTX = 0
    // for (const key in blockGeoDataArray) {
    //   if (blockGeoDataArray.hasOwnProperty(key)) {
    //     const blockGeoData = blockGeoDataArray[key]
    //     nTX = Object.keys(blockGeoData.blockData.tx).length
    //     break
    //   }
    // }

    // set up base geometry
    let treeMesh = await this.loadTreeModel(64)

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
    this.geometry.translate(0, -381, 0)

    blockGeoDataArray.forEach((blockGeoData, height) => {
      if (blockGeoData !== null) {
        let blockPosition = blockGeoData.blockData.pos

        let object = new THREE.Object3D()
        object.position.set(blockPosition.x, 0, blockPosition.z)
        object.lookAt(0, 0, 0)

        quatArray.push(object.quaternion.x)
        quatArray.push(object.quaternion.y)
        quatArray.push(object.quaternion.z)
        quatArray.push(object.quaternion.w)

        planeOffsetsArray.push(blockPosition.x)
        planeOffsetsArray.push(blockPosition.z)
      }
    })

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let blockHeights = new THREE.InstancedBufferAttribute(new Float32Array(blockHeightsArray), 1)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('blockHeight', blockHeights)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

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
    this.geometry = new THREE.InstancedBufferGeometry().copy(bufferGeo)

    this.geometry.computeVertexNormals()
    this.geometry.translate(0, -386.8, 0)

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

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
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
