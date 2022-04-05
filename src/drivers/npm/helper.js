const FS = require('fs')
// import * as vscode from 'vscode';
const axios = require('axios')
const BOMDetectorUrl = 'https://download.scantist.io/scantist-bom-detect.jar'

async function downloadFile(path) {
  const writer = FS.createWriteStream(path)
  const promise = new Promise((resolve, reject) => {
    writer.on('error', (err) => {
      console.log('errr', err)
      reject(err)
    })
    writer.on('close', () => {
      console.log('finished')
      resolve(true)
    })
  })

  const response = await axios.get(BOMDetectorUrl, {
    responseType: 'stream',
  })
  response.data.pipe(writer)
  return promise
}

module.exports = downloadFile