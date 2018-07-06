// libs
import * as THREE from 'three'

// shaders
import fragmentShader from './shaders/plane.frag'
import vertexShader from './shaders/plane.vert'

export default class Plane {
  constructor (args) {
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')

    this.normalMap.wrapS = THREE.RepeatWrapping
    this.normalMap.wrapT = THREE.RepeatWrapping
    this.normalMap.repeat.set(4, 4)

    this.bumpMap = new THREE.TextureLoader().load('assets/images/textures/bumpMap.jpg')
    this.roughnessMap = new THREE.TextureLoader().load('assets/images/textures/roughnessMap.jpg')
    this.planeSize = args.planeSize
    this.planeOffsetMultiplier = args.planeOffsetMultiplier

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

    this.material = new PlaneMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 1.0,
      roughness: 0.2,
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      /* roughnessMap: this.roughnessMap,
      metalnessMap: this.roughnessMap, */
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.1, 0.1)
    })
  }

  async getMultiple (blockGeoDataArray) {
    this.instanceCount = 0

    let blockHeightsArray = []
    // let offsetsArray = []
    let planeOffsetsArray = []
    // let anglesArray = []
    let quatArray = []

    let coils = 200
    let radius = 1000000
    let center = {x: 0, y: 0}

    // value of theta corresponding to end of last coil
    let thetaMax = coils * (Math.PI * 2)

    // How far to step away from center for each side.
    let awayStep = radius / thetaMax

    // distance between points to plot
    let chord = this.planeSize

    // set up base geometry
    let planeGeo = new THREE.BoxGeometry(this.planeSize, this.planeSize, 8, 10, 10, 10)

    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    // this.geometry.rotateX(Math.PI / 2)

    let blockIndex = 0
    for (const hash in blockGeoDataArray) {
      if (blockGeoDataArray.hasOwnProperty(hash)) {
        if (typeof this.theta === 'undefined') {
          let offset = this.planeSize * this.planeOffsetMultiplier
          let chord = this.planeSize + offset
          this.theta = chord / awayStep
        }

        // let blockGeoData = blockGeoDataArray[hash]

        let rotation = 0

        let away = awayStep * this.theta

        // How far around the center.
        let around = this.theta + rotation

        // Convert 'around' and 'away' to X and Y.
        let xOffset = center.x + Math.cos(around) * away
        let yOffset = center.y + Math.sin(around) * away

        let angle = -this.theta + (Math.PI / 2) + 0.015

        // to a first approximation, the points are on a circle
        // so the angle between them is chord/radius
        this.theta += chord / away

        var yRotMatrix = new THREE.Matrix4()
        yRotMatrix.set(
          Math.cos(angle), Math.sin(angle), 0, 0,
          -Math.sin(angle), Math.cos(angle), 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        )

        let quaternion = new THREE.Quaternion().setFromRotationMatrix(yRotMatrix)
        quatArray.push(quaternion.x)
        quatArray.push(quaternion.y)
        quatArray.push(quaternion.z)
        quatArray.push(quaternion.w)

        planeOffsetsArray.push(xOffset)
        planeOffsetsArray.push(yOffset)

        // blockHeightsArray.push(block.block.height)
        blockHeightsArray.push(blockIndex)

        // console.log('plane at height: ' + blockGeoData.blockData.height + ' added')

        blockIndex++
      }
    }

    // attributes
    // let offsets = new THREE.InstancedBufferAttribute(new Float32Array(offsetsArray), 3)
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let blockHeights = new THREE.InstancedBufferAttribute(new Float32Array(blockHeightsArray), 1)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)

    // this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('blockHeight', blockHeights)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }
}

class PlaneMaterial extends THREE.MeshStandardMaterial {
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
