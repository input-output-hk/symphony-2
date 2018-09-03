import * as THREE from 'three'

export default class Base {
  constructor (args) {
    this.planeSize = args.planeSize
    this.planeOffsetMultiplier = args.planeOffsetMultiplier
    this.planeMargin = args.planeMargin
    this.coils = args.coils
    this.radius = args.radius

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
}
