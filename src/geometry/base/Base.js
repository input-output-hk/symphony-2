import * as THREE from 'three'

export default class Base {
  constructor (args) {
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
    txValuesAttr,
    spentRatiosAttr,
    txTimesAttr
  ) {
    let blockPosition = blockGeoData.blockData.pos
    const txTimes = blockGeoData.blockData.txTimes

    if (typeof txTimes === 'undefined') {
      return
    }

    this.txIndexOffsets[blockGeoData.blockData.height] = this.txCount

    for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
      const tx = blockGeoData.blockData.tx[i]

      const txIndexOffset = this.txCount + i

      const txTime = txTimes[i]

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

      scalesAttr.setX(
        txIndexOffset,
        blockGeoData.scales[i]
      )

      let txValue = (tx.value * 0.00000001)
      if (txValue > 800) {
        txValue = 800
      }
      if (txValue < 1) {
        txValue = 1
      }

      txValuesAttr.setX(
        txIndexOffset,
        txValue
      )

      offsetsAttr.setY(
        txIndexOffset,
        txValue
      )

      txTimesAttr.setX(
        txIndexOffset,
        txTime
      )

      let spentCount = 0

      for (let outIndex = 0; outIndex < tx.out.length; outIndex++) {
        const el = tx.out[outIndex]
        if (el.spent === 1) {
          spentCount++
        }
      }

      let spentRatio = 1
      if (spentCount !== 0) {
        spentRatio = spentCount / tx.out.length
      } else {
        spentRatio = 0.0
      }

      spentRatiosAttr.setX(
        txIndexOffset,
        spentRatio
      )
    }

    spentRatiosAttr.needsUpdate = true
    txValuesAttr.needsUpdate = true
    scalesAttr.needsUpdate = true
    offsetsAttr.needsUpdate = true
    quaternionsAttr.needsUpdate = true
    txTimesAttr.needsUpdate = true
  }
}
