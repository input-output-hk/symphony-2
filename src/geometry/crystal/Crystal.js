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
    this.docRefGeo = this.firebaseDB.collection('blocks_geometry')
    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')

    this.normalMap.minFilter = THREE.NearestFilter
    // this.normalMap.magFilter = THREE.NearestFilter

    this.voronoi = new Voronoi()

    this.uTime = 0

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

      this.instanceCount = blockData.tx.length

      let offsets = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount * 2), 2)
      let scales = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)

      for (let i = 0; i < this.instanceCount; i++) {
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

  async getMultiple (blockGeoDataArray, times) {
    this.instanceCount = 0

    let blockHeightsArray = []
    let offsetsArray = []
    let idsArray = []

    let planeOffsetsArray = []
    let scalesArray = []
    let txArray = []
    let quatArray = []

    let blockIndex = 0

    for (const hash in blockGeoDataArray) {
      if (blockGeoDataArray.hasOwnProperty(hash)) {
        let blockGeoData = blockGeoDataArray[hash]

        let blockPosition = this.getBlockPosition(blockGeoData.blockData.height)

        let object = new THREE.Object3D()
        object.position.set(blockPosition.xOffset, 0, blockPosition.zOffset)
        object.lookAt(0, 0, 0)

        this.instanceCount += blockGeoData.blockData.tx.length

        for (let i = 0; i < blockGeoData.blockData.tx.length; i++) {
          let x = blockGeoData.offsets[i * 2 + 0]
          let y = 0
          let z = blockGeoData.offsets[i * 2 + 1]

          let vector = new THREE.Vector3(x, y, z)

          vector.applyQuaternion(object.quaternion)

          vector.x += blockPosition.xOffset
          vector.z += blockPosition.zOffset

          offsetsArray.push(vector.x)
          offsetsArray.push(vector.y)
          offsetsArray.push(vector.z)

          planeOffsetsArray.push(blockPosition.xOffset)
          planeOffsetsArray.push(blockPosition.zOffset)

          quatArray.push(object.quaternion.x)
          quatArray.push(object.quaternion.y)
          quatArray.push(object.quaternion.z)
          quatArray.push(object.quaternion.w)

          idsArray.push(i)
        }

        blockGeoData.scales.forEach((scale) => {
          scalesArray.push(scale)
          // blockHeightsArray.push(block.block.height)
          blockHeightsArray.push(blockIndex)
        })

        blockGeoData.blockData.tx.forEach((tx) => {
          txArray.push(tx)
        })

        console.log('block at height: ' + blockGeoData.blockData.height + ' added')

        blockIndex++
      }
    }

    // set up base geometry
    let tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 6)
    // tubeGeo.vertices[12].add(new THREE.Vector3(0, 0.03, 0))

    let tubeBufferGeo = new THREE.BufferGeometry().fromGeometry(tubeGeo)

    this.geometry = new THREE.InstancedBufferGeometry().copy(tubeBufferGeo)

    // attributes
    let blockHeights = new THREE.InstancedBufferAttribute(new Float32Array(blockHeightsArray), 1)
    let offsets = new THREE.InstancedBufferAttribute(new Float32Array(offsetsArray), 3)
    let ids = new THREE.InstancedBufferAttribute(new Float32Array(idsArray), 1)
    let txValues = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let planeOffsets = new THREE.InstancedBufferAttribute(new Float32Array(planeOffsetsArray), 2)
    let scales = new THREE.InstancedBufferAttribute(new Float32Array(scalesArray), 1)
    let spentRatios = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceCount), 1)
    let quaternions = new THREE.InstancedBufferAttribute(new Float32Array(quatArray), 4)
    let txTimes = new THREE.InstancedBufferAttribute(new Float32Array(times), 1)

    console.log('this.instanceCount: ' + this.instanceCount)

    for (let i = 0; i < this.instanceCount; i++) {
      if (typeof txArray[i] === 'undefined') {
        continue
      }
      let tx = txArray[i]

      let txValue = (tx.value * 0.00000001)
      if (txValue > 1000) {
        txValue = 1000
      }
      if (txValue < 1) {
        txValue = 1
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

    this.geometry.addAttribute('id', ids)
    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('txValue', txValues)
    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('spentRatio', spentRatios)
    this.geometry.addAttribute('blockHeight', blockHeights)
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
