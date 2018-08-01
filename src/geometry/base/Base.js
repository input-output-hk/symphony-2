import * as THREE from 'three'

export default class Base {
  constructor (args) {
    this.planeSize = args.planeSize
    this.planeOffsetMultiplier = args.planeOffsetMultiplier
    this.planeMargin = args.planeMargin
    this.coils = args.coils
    this.radius = args.radius

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

  getBlockPosition (blockIndex) {
    let thetaMax = this.coils * (Math.PI * 2)
    let awayStep = this.radius / thetaMax
    let chord = this.planeSize + this.planeMargin

    let xOffset
    let zOffset

    let offset = this.planeSize * this.planeOffsetMultiplier

    let theta = (this.planeSize + offset) / awayStep

    for (let index = 0; index <= blockIndex; index++) {
      let away = awayStep * theta
      if (index === blockIndex) {
        xOffset = Math.cos(theta) * away
        zOffset = Math.sin(theta) * away
      }
      theta += chord / away
    }

    return {
      xOffset,
      zOffset
    }
  }
}
