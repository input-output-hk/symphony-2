import * as THREE from 'three'

export default class TextureHelper {
  constructor (args) {
    this.config = args.config

    // this.positionTexture = null
  }

  setNodeCount (nodeCount) {
    this.nodeCount = nodeCount
  }

  setTextureSize (nodeCount) {
    this.setNodeCount(nodeCount)

    let width = 1
    let height = 1

    while (height * width < this.nodeCount) {
      width *= 2
      if (height * width >= this.nodeCount) {
        break
      }
      height *= 2
    }

    this.textureWidth = width
    this.textureHeight = height
  }

  getNodeTextureLocation (nodeID) {
    return {
      x: (nodeID % this.textureWidth) * (1 / this.textureWidth) + (1 / (this.textureWidth * 2)),
      y: Math.floor(nodeID / this.textureWidth) * (1 / this.textureHeight) + (1 / (this.textureHeight * 2))
    }
  }

  createPositionTexture ({
    defaultPositions = new Float32Array()
  } = {}) {
    let textureArray = new Float32Array(this.textureWidth * this.textureHeight * 4)
    for (let i = 0; i < this.nodeCount; i++) {
      let location = new THREE.Vector3(
        Math.random() * 200 - 100,
        Math.random() * 200 - 100,
        Math.random() * 200 - 100
      )

      location = location.normalize().multiplyScalar(this.config.scene.particleEmitterRadius)

      let lifeDuration = Math.ceil(Math.random() * this.config.scene.particleLifeMax)

      textureArray[i * 4 + 0] = location.x
      textureArray[i * 4 + 1] = location.y
      textureArray[i * 4 + 2] = location.z
      textureArray[i * 4 + 3] = lifeDuration
    }

    if (defaultPositions.length) {
      for (let index = 0; index < defaultPositions.length; index++) {
        textureArray[index] = defaultPositions[index]
      }
    }

    let positionTexture = new THREE.DataTexture(
      textureArray,
      this.textureWidth,
      this.textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    positionTexture.minFilter = THREE.NearestFilter
    positionTexture.magFilter = THREE.NearestFilter
    positionTexture.generateMipmaps = false
    positionTexture.needsUpdate = true

    return {
      positionTexture: positionTexture
    }
  }
}
