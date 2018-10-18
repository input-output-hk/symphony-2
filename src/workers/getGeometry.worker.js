import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
import 'firebase/storage'
import moment from 'moment'
import SimplexNoise from 'simplex-noise'
import { map } from '../utils/math'
import Voronoi from 'voronoi'
import VoronoiTools from '../utils/VoronoiTools'
import seedrandom from 'seedrandom'
import * as THREE from 'three'

let config = {}
let docRefGeo
let planeSize

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      config = data.config
      let blockData = data.blockData
      planeSize = data.planeSize

      firebase.initializeApp(config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)
      const firebaseDB = firebase.firestore()
      docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')

      firebase.auth().signInAnonymously().catch(function (error) {
        console.log(error.code)
        console.log(error.message)
      })

      // check for data in cache
      let blockRefGeo = docRefGeo.doc(blockData.hash)
      let snapshotGeo = await blockRefGeo.get()

      let blockGeoData
      if (!snapshotGeo.exists) {
        blockGeoData = await save(blockData)
      } else {
        let rawData = snapshotGeo.data()

        let offsetJSON = JSON.parse(rawData.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(rawData.scales)
        let scalesArray = Object.values(scalesJSON)

        blockGeoData = {
          offsets: offsetsArray,
          scales: scalesArray
        }
      }

      let returnData = {
        blockGeoData: blockGeoData
      }

      self.postMessage(returnData)
      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }

  self.postMessage(e.data)
}, false)

const save = async function (blockData) {
  return new Promise(async (resolve, reject) => {
    console.log('Block geo data: ' + blockData.hash + ' does not exist in the db, adding...')
    let pointCount = Math.max(blockData.n_tx, 4)

    const simplex = new SimplexNoise(blockData.height)

    const voronoi = new Voronoi()
    const voronoiTools = new VoronoiTools(voronoi, blockData.height, planeSize)

    let sites = []

    Math.seedrandom(blockData.height)

    for (let index = 0; index < pointCount; index++) {
      let found = false
      let x = 0
      let y = 0

      while (found === false) {
        x = Math.floor(Math.random() * planeSize - (planeSize / 2))
        y = Math.floor(Math.random() * planeSize - (planeSize / 2))

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

    let voronoiDiagram = voronoi.compute(sites, {
      xl: -planeSize / 2,
      xr: planeSize / 2,
      yt: -planeSize / 2,
      yb: planeSize / 2
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

      cell.halfedges.forEach((halfEdge) => {
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

      let planeXEdgeDist = (planeSize / 2) - Math.abs(site.x)
      let planeYEdgeDist = (planeSize / 2) - Math.abs(site.y)

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

    try {
      await docRefGeo.doc(blockData.hash).set({
        offsets: JSON.stringify(geoData.offsets),
        scales: JSON.stringify(geoData.scales),
        height: blockData.height
      }, { merge: true })
      console.log('Geo data for block: ' + blockData.hash + ' successfully written')
      resolve(geoData)
    } catch (error) {
      console.log('Error writing document: ', error)
    }
  })
}
