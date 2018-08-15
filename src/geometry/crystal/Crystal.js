// libs
import * as THREE from 'three'
import SimplexNoise from 'simplex-noise'
import { map } from '../../utils/math'
import Voronoi from 'voronoi'
import VoronoiTools from '../../utils/VoronoiTools'
import seedrandom from 'seedrandom'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/crystal.frag'
import vertexShader from './shaders/crystal.vert'

export default class Crystal extends Base {
  constructor (args) {
    super(args)
    this.firebaseDB = args.firebaseDB
    this.docRefGeo = this.firebaseDB.collection('bitcoin_blocks_geometry')
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')

    this.normalMap.minFilter = THREE.NearestFilter

    this.voronoi = new Voronoi()

    this.instanceTotal = 100 * 2000

    this.txCount = 0

    this.uTime = 0

    // this.cubeMap = new THREE.CubeTextureLoader()
    //   .setPath('assets/images/textures/cubemaps/playa-full/')
    //   .load([
    //     '0004.png',
    //     '0002.png',
    //     '0006.png',
    //     '0005.png',
    //     '0001.png',
    //     '0003.png'
    //   ])

    this.material = new CrystalMaterial({
      flatShading: true,
      opacity: 0.9,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.9,
      roughness: 0.0,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.05, 0.05)
    })
  }

  async save (blockData) {
    return new Promise((resolve, reject) => {
      console.log('Block geo data: ' + blockData.hash + ' does not exist in the db, adding...')
      let pointCount = Math.max(blockData.n_tx, 4)

      const simplex = new SimplexNoise(blockData.height)

      const voronoiTools = new VoronoiTools(this.voronoi, blockData.height, this.planeSize)

      let sites = []

      Math.seedrandom(blockData.height)

      for (let index = 0; index < pointCount; index++) {
        let found = false
        let x = 0
        let y = 0

        while (found === false) {
          x = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))
          y = Math.floor(Math.random() * this.planeSize - (this.planeSize / 2))

          let noiseVal = simplex.noise2D(x / 300, y / 300)

          if (((Math.random() * 5) * noiseVal) > -0.3) {
            let exists = false
            for (let existsIndex = 0; existsIndex < sites.length; existsIndex++) {
              const site = sites[existsIndex]
              if (site.x === x && site.y === y) {
                exists = true
                break
              }
            }
            if (!exists) {
              found = true
            }
          }
        }
        sites.push({x: x, y: y})
      }

      let voronoiDiagram = this.voronoi.compute(sites, {
        xl: -this.planeSize / 2,
        xr: this.planeSize / 2,
        yt: -this.planeSize / 2,
        yb: this.planeSize / 2
      })

      // work out network health
      let feeToValueRatio = 0
      if (blockData.outputTotal !== 0) {
        feeToValueRatio = blockData.fee / blockData.outputTotal
      }

      let blockHealth = map(feeToValueRatio, 0, 0.0001, 20, 0)
      if (blockHealth < 0) {
        blockHealth = 0
      }

      let relaxIterations = Math.round(blockHealth)

      if (blockData.n_tx > 1) {
        for (let index = 0; index < relaxIterations; index++) {
          try {
            voronoiDiagram = voronoiTools.relaxSites(voronoiDiagram)
          } catch (error) {
            console.log(error)
          }
        }
      }

      let offsets = new THREE.InstancedBufferAttribute(new Float32Array(blockData.tx.length * 2), 2)
      let scales = new THREE.InstancedBufferAttribute(new Float32Array(blockData.tx.length), 1)

      for (let i = 0; i < blockData.tx.length; i++) {
        if (typeof blockData.tx[i] === 'undefined') {
          continue
        }
        let cell = voronoiDiagram.cells[i]

        let site = new THREE.Vector2(cell.site.x, cell.site.y)

        // look at all adjacent cells and get the closest site to this site
        let minDistToSite = Number.MAX_SAFE_INTEGER

        cell.halfedges.forEach((halfEdge, index) => {
          if (halfEdge.edge.rSite !== null) {
            let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.rSite.x, halfEdge.edge.rSite.y).distanceToSquared(site)
            if (distanceToSiteSq > 0) {
              minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
            }
          }
          if (halfEdge.edge.lSite !== null) {
            let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.lSite.x, halfEdge.edge.lSite.y).distanceToSquared(site)
            if (distanceToSiteSq > 0) {
              minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
            }
          }
        })

        let radius = Math.sqrt(minDistToSite) * 0.5

        let planeXEdgeDist = (this.planeSize / 2) - Math.abs(site.x)
        let planeYEdgeDist = (this.planeSize / 2) - Math.abs(site.y)

        if (planeXEdgeDist < radius) {
          radius = planeXEdgeDist
        }
        if (planeYEdgeDist < radius) {
          radius = planeYEdgeDist
        }

        offsets.setXY(
          i,
          site.x,
          site.y
        )

        scales.setX(
          i,
          radius
        )
      }

      let geoData = {
        offsets: offsets.array,
        scales: scales.array
      }

      this.docRefGeo.doc(blockData.hash).set({
        offsets: JSON.stringify(geoData.offsets),
        scales: JSON.stringify(geoData.scales),
        height: blockData.height
      }, { merge: true })
        .then(function () {
          console.log('Geo data for block: ' + blockData.hash + ' successfully written')
          resolve(geoData)
        }).catch(function (error) {
          console.log('Error writing document: ', error)
        })
    })
  }

  async init (blockGeoData, times) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)
    this.planeOffsetsArray = new Float32Array(this.instanceTotal * 2)
    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)
    this.timesArray = new Float32Array(times)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)

    // attributes
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let planeOffsets = new THREE.InstancedBufferAttribute(this.planeOffsetsArray, 2)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      offsets,
      planeOffsets,
      quaternions,
      scales,
      txValues,
      spentRatios,
      txTimes
    )

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('txTime', txTimes)

    const positionAttrib = this.geometry.getAttribute('position')

    let barycentric = []

    // for each triangle in the geometry, add the barycentric coordinates
    for (let i = 0; i < positionAttrib.count / 3; i++) {
      if (
        i === 23 ||
        i === 22 ||
        i === 21 ||
        i === 20 ||
        i === 19 ||
        i === 18 ||
        i === 17 ||
        i === 16 ||
        i === 15 ||
        i === 14 ||
        i === 13 ||
        i === 12
      ) {
        barycentric.push(
          0, 0, 0,
          0, 0, 0,
          0, 0, 0
        )
      } else if (i % 2 === 0) {
        barycentric.push(
          0, 0, 1,
          0, 1, 0,
          1, 0, 1
        )
      } else {
        barycentric.push(
          0, 1, 0,
          0, 0, 1,
          1, 0, 1
        )
      }
    }

    const array = new Float32Array(barycentric)
    const attribute = new THREE.BufferAttribute(array, 3)
    this.geometry.addAttribute('barycentric', attribute)

    let centerTopVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const CTVArray = new Float32Array(centerTopVertex)
    const CTVAttribute = new THREE.BufferAttribute(CTVArray, 1)
    this.geometry.addAttribute('centerTopVertex', CTVAttribute)

    let centerBottomVertex = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      0, 0, 1,
      0, 0, 1,
      0, 0, 1

    ]

    const CBVArray = new Float32Array(centerBottomVertex)
    const CBVAttribute = new THREE.BufferAttribute(CBVArray, 1)
    this.geometry.addAttribute('centerBottomVertex', CBVAttribute)

    let topVertex = [
      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 0, 1,
      0, 0, 1,
      1, 0, 1,

      0, 0, 1,
      1, 0, 1,
      0, 0, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      1, 1, 1,
      1, 1, 1,
      1, 1, 1,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0,

      0, 0, 0,
      0, 0, 0,
      0, 0, 0
    ]

    const TVArray = new Float32Array(topVertex)
    const TVAttribute = new THREE.BufferAttribute(TVArray, 1)
    this.geometry.addAttribute('topVertex', TVAttribute)

    this.txCount += blockGeoData.blockData.tx.length

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  setTxAttributes (
    object,
    blockGeoData,
    offsets,
    planeOffsets,
    quaternions,
    scales,
    txValues,
    spentRatios,
    txTimes
  ) {
    // let txArray = []
    // blockGeoData.blockData.tx.forEach((tx) => {
    //   txArray.push(tx)
    // })

    let blockPosition = blockGeoData.blockData.pos

    for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
      // if (typeof txArray[i] === 'undefined') {
      //   continue
      // }

      const tx = blockGeoData.blockData.tx[i]

      let x = blockGeoData.offsets[i * 2 + 0]
      let y = 0
      let z = blockGeoData.offsets[i * 2 + 1]

      let vector = new THREE.Vector3(x, y, z)

      vector.applyQuaternion(object.quaternion)

      vector.x += blockPosition.x
      vector.z += blockPosition.z

      offsets.array[(this.txCount + i) * 3 + 0] = vector.x
      offsets.array[(this.txCount + i) * 3 + 1] = vector.y
      offsets.array[(this.txCount + i) * 3 + 2] = vector.z

      planeOffsets.array[(this.txCount + i) * 2 + 0] = blockPosition.x
      planeOffsets.array[(this.txCount + i) * 2 + 1] = blockPosition.z

      quaternions.array[(this.txCount + i) * 4 + 0] = object.quaternion.x
      quaternions.array[(this.txCount + i) * 4 + 1] = object.quaternion.y
      quaternions.array[(this.txCount + i) * 4 + 2] = object.quaternion.z
      quaternions.array[(this.txCount + i) * 4 + 3] = object.quaternion.w

      blockGeoData.scales.forEach((scale, i) => {
        scales.array[this.txCount + i] = scale
      })

      // let tx = txArray[i]

      let txValue = (tx.value * 0.00000001)
      if (txValue > 1000) {
        txValue = 1000
      }
      if (txValue < 1) {
        txValue = 1
      }

      txValues.setX(
        this.txCount + i,
        txValue
      )

      offsets.setY(
        this.txCount + i,
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
        this.txCount + i,
        spentRatio
      )
    }

    txTimes.needsUpdate = true
    spentRatios.needsUpdate = true
    txValues.needsUpdate = true
    scales.needsUpdate = true
    offsets.needsUpdate = true
    quaternions.needsUpdate = true
    planeOffsets.needsUpdate = true
  }

  async updateGeometry (blockGeoData) {
    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    console.time('setTxAttributes')
    this.setTxAttributes(
      object,
      blockGeoData,
      this.geometry.attributes.offset,
      this.geometry.attributes.planeOffset,
      this.geometry.attributes.quaternion,
      this.geometry.attributes.scale,
      this.geometry.attributes.txValue,
      this.geometry.attributes.spentRatio,
      this.geometry.attributes.txTime
    )
    console.timeEnd('setTxAttributes')

    this.txCount += blockGeoData.blockData.tx.length
  }

  update (time, audioTime, firstLoop) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uAudioTime.value = audioTime
    this.material.uniforms.uFirstLoop.value = firstLoop
  }
}

class CrystalMaterial extends THREE.MeshStandardMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uAudioTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uFirstLoop = {
      type: 'f',
      value: 1.0
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
