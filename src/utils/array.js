export const asyncForEach = async function (array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

export const concatenate = function (arrays) {
  let totalLength = 0
  arrays.forEach(arr => {
    totalLength += arr.length
  })

  let result = new Float32Array(totalLength)
  let offset = 0
  arrays.forEach(arr => {
    result.set(arr, offset)
    offset += arr.length
  })
  return result
}
