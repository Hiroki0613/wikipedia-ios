#!/usr/bin/env node

const https = require('https')
const util = require('util')
const fs = require('fs')

// fetch using node's built-in 'https'
const fetcher = (url, handler) => {
  https.get(url, (res) => {
    res.setEncoding('utf8')
    let data = ''
    res.on('data', (chunk) => {
      data += chunk
    })
    res.on('end', () => handler(null, JSON.parse(data)))
  }).on("error", err => handler(err, null))
}

// promisified fetcher
const fetch = util.promisify(fetcher)

const outputPath = '../Wikipedia/Code/wikipedia-namespaces'

const langFromSiteInfo = info => Object.entries(info)[1][1].code

const excludedLanguageCodes = new Set(['be-x-old', 'mo', 'yue'])

const codesFromJSON = json => Object.entries(json.sitematrix).map(langFromSiteInfo).filter(code => code !== undefined && !excludedLanguageCodes.has(code))

const excludedAmbiguousNamespaceIDs = new Set([104, 105, 106, 107, 110, 111])

const normalizeString = string => string.toUpperCase().replace(/\s+/g, ' ')

const translationsFromSiteInfoResponseJSON = (siteInfoResponseJSON, sitematrixLangCode) => {
  let namespacedict = {}

  Object.entries(siteInfoResponseJSON.query.namespaces)
    .filter(item => !excludedAmbiguousNamespaceIDs.has(item[1].id))
    .forEach(item => namespacedict[normalizeString(item[1].name)] = item[1].id)

  Object.entries(siteInfoResponseJSON.query.namespacealiases)
    .filter(item => !excludedAmbiguousNamespaceIDs.has(item[1].id))
    .forEach(item => namespacedict[normalizeString(item[1].alias)] = item[1].id)

    let output = {}
    output[sitematrixLangCode] = {
      namespace: namespacedict,
      mainpage: siteInfoResponseJSON.query.general.mainpage
    }

    return {
      languagecode: output
    }
}

const generateTranslationsJSON = () => {
  let sitematrixLangCodes = []
  return fetch('https://en.wikipedia.org/w/api.php?action=sitematrix&format=json&smtype=language&smstate=all&smlangprop=code&formatversion=2&origin=*')
  .then(codesFromJSON)
  .then(codes => sitematrixLangCodes = codes)
  .then(codes => codes.map(code => `https://${code}.wikipedia.org/w/api.php?action=query&format=json&prop=&list=&meta=siteinfo&siprop=namespaces%7Cgeneral%7Cnamespacealiases&formatversion=2&origin=*`))
  .then(siteInfoURLs => siteInfoURLs.map(url => fetch(url)))
  .then(siteInfoFetches => Promise.all(siteInfoFetches))
  .then(allFetchResultsJSON => [sitematrixLangCodes, allFetchResultsJSON.map((siteInfoResponseJSON, i) => translationsFromSiteInfoResponseJSON(siteInfoResponseJSON, sitematrixLangCodes[i]))])
}

const writeTranslationToFile = (translation, filePath) => {
  fs.writeFile(filePath, JSON.stringify(translation, null, 2), 'utf8', (err) => {
      if (err) throw err
      console.log(`File saved! ${filePath}`)
  })
}

const writeDuplicateTranslationToFileIfNecessary = (forLangCode, withLangCode, translation) => {
  if (translation.languagecode[forLangCode]) {
    translation.languagecode[withLangCode] = translation.languagecode[forLangCode]
    delete translation.languagecode[forLangCode]
    writeTranslationToFile(translation, `${outputPath}/${withLangCode}.json`)
  }
}

generateTranslationsJSON()
  .then( ([sitematrixLangCodes, translations])  => {
    translations.forEach((translation, i) => {
      writeTranslationToFile(translation, `${outputPath}/${sitematrixLangCodes[i]}.json`)
      writeDuplicateTranslationToFileIfNecessary('en', 'test', translation)
    })
  })
