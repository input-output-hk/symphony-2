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

    this.material = new TreeMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 1.0,
      roughness: 0.2,
      // transparent: true,
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

  async loadTreeModel (txCount) {
    return new Promise(async (resolve, reject) => {
      // Load a glTF resource
      this.binaryTree = await this.gltfLoader.load(
        'assets/models/gltf/binary-tree-13.gltf',
        function (gltf) {
          let mesh = gltf.scene.children[0]

          mesh.geometry.rotateZ(Math.PI / 2)
          // mesh.geometry.rotateY(Math.PI / 2)

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
    this.instanceCount = 0

    let blockHeightsArray = []
    let planeOffsetsArray = []
    let quatArray = []

    let thetaMax = this.coils * (Math.PI * 2)
    let awayStep = this.radius / thetaMax
    let chord = this.planeSize + this.planeMargin

    // set up base geometry
    let treeMesh = await this.loadTreeModel()

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
    this.geometry.translate(0, -395, 0)

    let theta = 0
    let blockIndex = 0
    for (const hash in blockGeoDataArray) {
      if (blockGeoDataArray.hasOwnProperty(hash)) {
        if (theta === 0) {
          let offset = this.planeSize * this.planeOffsetMultiplier
          let chord = this.planeSize + offset
          theta = chord / awayStep
        }

        let away = awayStep * theta
        let xOffset = Math.cos(theta) * away
        let zOffset = Math.sin(theta) * away
        theta += chord / away

        let object = new THREE.Object3D()
        object.position.set(xOffset, 0, zOffset)
        object.lookAt(0, 0, 0)

        quatArray.push(object.quaternion.x)
        quatArray.push(object.quaternion.y)
        quatArray.push(object.quaternion.z)
        quatArray.push(object.quaternion.w)

        planeOffsetsArray.push(xOffset)
        planeOffsetsArray.push(zOffset)

        // blockHeightsArray.push(block.block.height)
        blockHeightsArray.push(blockIndex)

        // console.log('tree at height: ' + blockGeoData.blockData.height + ' added')

        blockIndex++
      }
    }

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
