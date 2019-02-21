import * as THREE from 'three'
import { map } from '../../utils/math'
export default class Base {
  constructor (args) {
    this.config = args.config
    this.planeSize = args.planeSize
    this.planeOffsetMultiplier = args.planeOffsetMultiplier
    this.planeMargin = args.planeMargin

    this.index = 0

    this.uTime = 0

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa2/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.bumpMap = new THREE.TextureLoader().load('assets/images/textures/bumpMap.jpg')
    this.roughnessMap = new THREE.TextureLoader().load('assets/images/textures/roughnessMap.jpg')
    // this.roughnessMap = new THREE.TextureLoader().load('assets/images/textures/marble-floor.jpg')
    this.roughnessMap.wrapS = THREE.RepeatWrapping
    this.roughnessMap.wrapT = THREE.RepeatWrapping

    this.alphaMap = new THREE.TextureLoader().load('assets/images/textures/alphaMap.jpg')
    this.alphaMap.wrapS = this.alphaMap.wrapT = THREE.MirroredRepeatWrapping
  }

  updateOriginOffset (originOffset) {
    this.material.uniforms.uOriginOffset.value = originOffset
  }

  setTxAttributes (
    object,
    blockGeoData,
    offsetsAttr,
    quaternionsAttr,
    scalesAttr,
    txValuesArray,
    spentRatiosAttr,
    txTimesAttr,
    offsetsArray2D
  ) {
    let blockPosition = blockGeoData.blockData.pos

    this.txIndexOffsets[blockGeoData.blockData.height] = this.txCount

    let blockTxCount = blockGeoData.blockData.n_tx

    for (let i = 0; i < blockTxCount; i++) {
      const txIndexOffset = this.txCount + i

      if (offsetsArray2D) {
        offsetsArray2D[txIndexOffset * 2 + 0] = blockGeoData.offsets[i * 2 + 0]
        offsetsArray2D[txIndexOffset * 2 + 1] = blockGeoData.offsets[i * 2 + 1]
      }

      let x = blockGeoData.offsets[i * 2 + 0]
      let y = 0
      let z = blockGeoData.offsets[i * 2 + 1]

      let vector = new THREE.Vector3(x, y, z)

      vector.applyQuaternion(object.quaternion)

      vector.x += blockPosition.x
      vector.z += blockPosition.z

      offsetsAttr.array[txIndexOffset * 3 + 0] = vector.x
      offsetsAttr.array[txIndexOffset * 3 + 1] = vector.y
      offsetsAttr.array[txIndexOffset * 3 + 2] = vector.z

      quaternionsAttr.array[txIndexOffset * 4 + 0] = object.quaternion.x
      quaternionsAttr.array[txIndexOffset * 4 + 1] = object.quaternion.y
      quaternionsAttr.array[txIndexOffset * 4 + 2] = object.quaternion.z
      quaternionsAttr.array[txIndexOffset * 4 + 3] = object.quaternion.w
      quaternionsAttr.needsUpdate = true

      let scale = blockGeoData.scales[i]
      if (scale > 20) {
        scale = 20
      }

      scalesAttr.setX(
        txIndexOffset,
        scale
      )
      scalesAttr.needsUpdate = true

      if (txValuesArray) {
        txValuesArray[txIndexOffset] = blockGeoData.blockData.txValues[i]
      }

      let txValue = blockGeoData.blockData.txValues[i] * 0.00000001
      if (txValue > 2000) {
        txValue = 2000
      }
      if (txValue < 0.5) {
        txValue = 0.5
      }

      offsetsAttr.setY(
        txIndexOffset,
        txValue
      )

      offsetsAttr.needsUpdate = true

      if (txTimesAttr) {
        let txTime = map(i, 0, blockTxCount, 0, this.config.audio.soundDuration - 9)
        txTimesAttr.setX(
          txIndexOffset,
          txTime
        )
        txTimesAttr.needsUpdate = true
      }

      if (spentRatiosAttr) {
        let spentRatio = blockGeoData.blockData.txSpentRatios[i]
        spentRatiosAttr.setX(
          txIndexOffset,
          spentRatio
        )
        spentRatiosAttr.needsUpdate = true
      }
    }
  }
}
