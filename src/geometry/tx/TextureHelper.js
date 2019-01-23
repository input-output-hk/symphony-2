import * as THREE from 'three'

export default class TextureHelper {
  constructor (args) {
    this.config = args.config
    this.textureIndex = 0
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

  createPositionTexture (
    blockPositions,
    txHeights
  ) {
    if (typeof this.textureArray === 'undefined') {
      this.textureArray = new Float32Array(this.textureWidth * this.textureHeight * 4)
    }
    if (typeof this.quatArray === 'undefined') {
      this.quatArray = new Float32Array(this.nodeCount * 4)
    }

    if (this.textureIndex / 4 > this.nodeCount) {
      console.log('reset line texture')
      this.textureIndex = 0
    }

    // reset
    this.textureArray.forEach((el, i) => {
      this.textureArray[i] = 0
    })

    txHeights.forEach(height => {
      if (typeof height !== 'undefined') {
        let x = blockPositions[height * 2 + 0] + Math.random() * 200 - 100
        let y = 300 + Math.random() * 10000
        let z = blockPositions[height * 2 + 1] + Math.random() * 200 - 100

        let location = new THREE.Vector3(x, y, z)

        let object = new THREE.Object3D()
        object.position.set(x, 0, z)
        object.lookAt(0, 0, 0)

        let vector = new THREE.Vector3(x, y, z)
        vector.applyQuaternion(object.quaternion)

        vector.x += x
        vector.z += z

        this.quatArray[this.textureIndex + 0] = object.quaternion.x
        this.quatArray[this.textureIndex + 1] = object.quaternion.y
        this.quatArray[this.textureIndex + 2] = object.quaternion.z
        this.quatArray[this.textureIndex + 3] = object.quaternion.w

        this.textureArray[this.textureIndex + 0] = location.x
        this.textureArray[this.textureIndex + 1] = location.y
        this.textureArray[this.textureIndex + 2] = location.z
        this.textureArray[this.textureIndex + 3] = 1

        this.textureIndex += 4
      }
    })

    let positionTexture = new THREE.DataTexture(
      this.textureArray,
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
      positionTexture: positionTexture,
      quatArray: this.quatArray
    }
  }
}
