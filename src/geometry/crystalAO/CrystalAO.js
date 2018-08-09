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
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      transparent: true,
      side: THREE.DoubleSide,
      map: this.map,
      opacity: 0.4,
      depthTest: true,
      depthWrite: false
    })
  }

  async getMultiple (blockGeoDataArray, times) {
    this.instanceCount = 0

    let blockHeightsArray = []
    let offsetsArray = []

    let planeOffsetsArray = []
    let scalesArray = []
    let txArray = []
    let quatArray = []

    let blockIndex = 0

    blockGeoDataArray.forEach((blockGeoData, height) => {
      let blockPosition = blockGeoData.blockData.pos

      let object = new THREE.Object3D()
      object.position.set(blockPosition.x, 0, blockPosition.z)
      object.lookAt(0, 0, 0)

      this.instanceCount += blockGeoData.blockData.tx.length

      for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
        let x = blockGeoData.offsets[i * 2 + 0]
        let y = 0
        let z = blockGeoData.offsets[i * 2 + 1]

        let vector = new THREE.Vector3(x, y, z)

        vector.applyQuaternion(object.quaternion)

        vector.x += blockPosition.x
        vector.z += blockPosition.z

        offsetsArray.push(vector.x)
        offsetsArray.push(vector.y)
        offsetsArray.push(vector.z)

        planeOffsetsArray.push(blockPosition.x)
        planeOffsetsArray.push(blockPosition.z)

        quatArray.push(object.quaternion.x)
        quatArray.push(object.quaternion.y)
        quatArray.push(object.quaternion.z)
        quatArray.push(object.quaternion.w)
      }

      blockGeoData.scales.forEach((scale) => {
        scale *= 2.5

        scalesArray.push(scale)
        // blockHeightsArray.push(block.block.height)
        blockHeightsArray.push(blockIndex)
      })

      blockGeoData.blockData.tx.forEach((tx) => {
        txArray.push(tx)
      })

      console.log('block at height: ' + blockGeoData.blockData.height + ' added')

      blockIndex++
    })

    // set up base geometry
    let planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    // this.geometry.translate(0, -0.01, 0)

    // attributes
    let blockHeights = new THREE.InstancedBufferAttribute(new Float32Array(blockHeightsArray), 1)
    let offsets = new THREE.InstancedBufferAttribute(new Float32Array(offsetsArray), 3)
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let scales = new THREE.InstancedBufferAttribute(new Float32Array(scalesArray), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(times), 1)

    for (let i = 0; i < this.instanceCount; i++) {
      if (typeof txArray[i] === 'undefined') {
        continue
      }
      let tx = txArray[i]

      let txValue = (tx.value * 0.00000001) + 1.0
      if (txValue > 1000) {
        txValue = 1000
      }

      txValues.setX(
        i,
        txValue
      )

      offsets.setY(
        i,
        txValue
      )

      let spentCount = 0
      tx.out.forEach(function (el, index) {
        if (el.spent === 1) {
          spentCount++
        }
      })

      let spentRatio = 1
      if (spentCount !== 0) {
        spentRatio = spentCount / tx.out.length
      } else {
        spentRatio = 0.0
      }

      spentRatios.setX(
        i,
        spentRatio
      )
    }

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('blockHeight', blockHeights)
    this.geometry.addAttribute('quaternion', quaternions)
    // this.geometry.addAttribute('txTime', txTimes)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  update (time, audioTime, firstLoop) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uAudioTime.value = audioTime
    this.material.uniforms.uFirstLoop.value = firstLoop
  }
}

class CrystalAOMaterial extends THREE.MeshStandardMaterial {
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
