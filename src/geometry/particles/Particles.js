// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/particles.frag'
import vertexShader from './shaders/particles.vert'
import PassThroughVert from './shaders/passThrough.vert'
import PassThroughFrag from './shaders/passThrough.frag'
import PositionFrag from './shaders/position.frag'

// helpers
import TextureHelper from './TextureHelper'

export default class Particles extends Base {
  constructor (args) {
    super(args)

    this.particleCount = 100000

    this.frame = 0

    this.textureHelper = new TextureHelper(args)
    this.textureHelper.setTextureSize(this.particleCount)

    this.material = new ParticlesMaterial({
      color: 0x709eec,
      transparent: true,
      opacity: 1.0,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false
      // depthTest: false
    })

    this.textureHeight = this.textureHelper.textureHeight
    this.textureWidth = this.textureHelper.textureWidth

    this.positionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: {
          type: 't',
          value: null
        },
        defaultPositionTexture: {
          type: 't',
          value: null
        },
        uOriginOffset: {
          type: 'v2',
          value: new THREE.Vector2(0.0, 0.0)
        },
        uDeltaTime: {
          type: 'f',
          value: 0.0
        },
        uFrame: {
          type: 'f',
          value: 0.0
        }
      },
      vertexShader: PassThroughVert,
      fragmentShader: PositionFrag
    })

    this.initCamera()

    this.initPassThrough()

    this.positionRenderTarget1 = new THREE.WebGLRenderTarget(this.textureWidth, this.textureHeight, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: this.config.floatType,
      depthWrite: false,
      depthBuffer: false,
      stencilBuffer: false
    })

    this.positionRenderTarget2 = this.positionRenderTarget1.clone()

    this.outputPositionRenderTarget = this.positionRenderTarget1
  }

  updateOriginOffset (originOffset) {
    this.positionMaterial.uniforms.uOriginOffset.value = originOffset

    this.material.uniforms.uOriginOffset.value = originOffset
  }

  initPassThrough () {
    this.passThroughScene = new THREE.Scene()
    this.passThroughMaterial = new THREE.ShaderMaterial({
      uniforms: {
        texture: {
          type: 't',
          value: null
        }
      },
      vertexShader: PassThroughVert,
      fragmentShader: PassThroughFrag
    })
    let mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.passThroughMaterial)
    mesh.frustumCulled = false
    this.passThroughScene.add(mesh)
  }

  passThroughTexture (input, output) {
    this.passThroughMaterial.uniforms.texture.value = input

    this.renderer.vr.enabled = false
    this.renderer.setRenderTarget(output)
    this.renderer.render(this.passThroughScene, this.quadCamera)
  }

  async init (args) {
    this.renderer = args.renderer

    let positionData = this.textureHelper.createPositionTexture()
    this.defaultPositionTexture = positionData.positionTexture

    this.passThroughTexture(positionData.positionTexture, this.positionRenderTarget1)
    this.passThroughTexture(this.positionRenderTarget1.texture, this.positionRenderTarget2)

    this.positionMaterial.uniforms.defaultPositionTexture.value = this.defaultPositionTexture
    this.material.uniforms.defaultPositionTexture.value = this.defaultPositionTexture

    this.positionScene = new THREE.Scene()

    this.positionMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.positionMaterial)
    this.positionMesh.frustumCulled = false
    this.positionScene.add(this.positionMesh)

    this.geometry = new THREE.BufferGeometry()

    let positionArray = new Float32Array(this.particleCount * 3)

    this.setTextureLocations(
      this.particleCount,
      positionArray
    )

    let position = new THREE.BufferAttribute(positionArray, 3)
    this.geometry.addAttribute('position', position)

    let life = new THREE.BufferAttribute(new Float32Array(positionData.lifeArray), 1)
    this.geometry.addAttribute('life', life)

    let idArray = new Float32Array(this.particleCount)
    for (let index = 0; index < idArray.length; index++) {
      idArray[index] = index
    }

    let id = new THREE.BufferAttribute(idArray, 1)
    this.geometry.addAttribute('id', id)

    this.mesh = new THREE.Points(this.geometry, this.material)

    this.material.uniforms.uParticleLifeMax.value = this.config.scene.particleLifeMax

    this.mesh.frustumCulled = false

    return this.mesh
  }

  updatePositions () {
    let inputPositionRenderTarget = this.positionRenderTarget1
    this.outputPositionRenderTarget = this.positionRenderTarget2
    if (this.frame % 2 === 0) {
      inputPositionRenderTarget = this.positionRenderTarget2
      this.outputPositionRenderTarget = this.positionRenderTarget1
    }
    this.positionMaterial.uniforms.positionTexture.value = inputPositionRenderTarget.texture

    this.renderer.vr.enabled = false
    this.renderer.setRenderTarget(this.outputPositionRenderTarget)
    this.renderer.render(this.positionScene, this.quadCamera)

    this.material.uniforms.positionTexture.value = this.outputPositionRenderTarget.texture
  }

  update (args) {
    this.frame++

    this.material.uniforms.uFrame.value = this.frame

    this.updatePositions()
  }

  initCamera () {
    this.quadCamera = new THREE.OrthographicCamera()
    this.quadCamera.position.z = 1
  }

  setTextureLocations (
    nodeCount,
    positionArray
  ) {
    for (let i = 0; i < nodeCount; i++) {
      let textureLocation = this.textureHelper.getNodeTextureLocation(i)
      positionArray[i * 3 + 0] = textureLocation.x
      positionArray[i * 3 + 1] = textureLocation.y
    }
  }
}

class ParticlesMaterial extends THREE.PointsMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.points.uniforms

    this.uniforms.uFrame = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uParticleLifeMax = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.positionTexture = {
      type: 't',
      value: null
    }

    this.uniforms.defaultPositionTexture = {
      type: 't',
      value: null
    }

    this.uniforms.scale = {
      type: 'f',
      value: 10.0
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
