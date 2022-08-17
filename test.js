import { expect } from 'chai'
import  { Octokit } from '@octokit/rest';
import Web3 from 'web3';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccount';
import mongoose, { MongooseError } from 'mongoose';
import models from './models';
import Promise from 'bluebird';
import GitHubRepoParser from 'github-repo-parser';
import { convert } from 'html-to-text';
import { parseForBinanceKeys, clean } from './helpers';

import ccxt from 'ccxt';
import { SentryError } from '@sentry/utils';

const Sentry = require('@sentry/node')


let jon = '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';
let user32 = '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'
let url_binance = 'https://bsc-dataseed.binance.org'
let url_mainnet = "https://mainnet.infura.io/v3/9e34ce9faf8b4c6ca400b914af9cb665"
let url_binance_2 = 'https://bsc-dataseed1.defibit.io/'
const networks = [url_binance, url_mainnet, url_binance_2]
let gh = new Octokit({
  auth:  user32,
  onRateLimit: (retryAfter, options, octokit) => {
    console.log('rate limited')
  }
})
const parser = new GitHubRepoParser(jon)

const initApiKeyPrefixes = () => {
  const apiKeyPrefixes = ['apiKey', 'api_key', 'API_KEY'] // these are variable name variations ive seen out in the wild people are using when naming their api key variables.
                            // I'm using these as a way to identify api keys in peoples code.
                            
  const exchangeApiKeyPrefixes = ccxt.exchanges.map(item => {
    return [`${item}_api_key`, `${item}_API_KEY`, `${item}ApiKey`, `${item}Key`, `${item}APIKey`]
  })
  return [apiKeyPrefixes, ...exchangeApiKeyPrefixes]
}

const initSecretKeyPrefixes = () => {
  const secretKeyPrefixes = ['secret', 'secret_key', 'api_secret', 'API_SECRET', 'SECRET_KEY', 'SECRET', 'apiSecret'] // these are variable name variations ive seen out in the wild people are using when naming their api key variables.
                            // I'm using these as a way to identify api keys in peoples code.
                            
  const exchangeSecretKeyPrefixes = ccxt.exchanges.map(item => {
    return [`${item}_secret_key`, `${item}APISecret`, `${item}ApiSecret`, `${item.toUpperCase()}_SECRET`, `${item}SecretKey`, `${item}secretKey`, `${item.toUpperCase()}_SECRET_KEY`, `${item}secret`, `${item}Secret`]
  })
  return [secretKeyPrefixes, ...exchangeSecretKeyPrefixes]
}

const unique = array => {
  return array.filter((a, b) => array.indexOf(a) ===b)
}

const finalClean = arr => {
  return arr.map(item => item.replace('=', ''))
}
describe('tests', async () => {
  let base64RegEx = new RegExp('[^-A-Za-z0-9+/=]|=[^=]|={3,}$')
  
  before(done  => {
    console.log('beforeEach running')
    process.on('uncaughtException', err => console.log(err))
    process.on('unhandledRejection', err => console.log(err))
    mongoose.connect('mongodb+srv://jkol36:TheSavage1990@cluster0.bvjyjf3.mongodb.net/?retryWrites=true&w=majority').then(res => {
      console.log('database connected', res)
      done()
    })
    
    
  })

  it('should find matching api keys for secrets', async () => {
    let secrets = [
      
        'SECRET_KEY =C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2',
        'C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2juw48OF5TeeK',
        'SECRET_KEY C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2j',
        ' =C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2juw48OF5Te',
        ' C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2juw48OF5Tee',
        '_KEY =C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2juw48O',
        '_KEY C4pL3f6HHyzRejV12EbbT0Q6FBxDxCKsQussKhCyWlWhdTbfWSg2juw48OF'
      
    ]
    let parsedSecrets = []
    
    parsedSecrets.push(secrets.map(secret => secret.split('=')[1]))
    parsedSecrets.push(secrets.map(secret => secret.split(' ')[1]))
    parsedSecrets = parsedSecrets.reduce((a, b) => [...a, ...b])
    console.log(parsedSecrets)
    parsedSecrets = parsedSecrets.filter(secret => secret !== undefined).map(secret => secret.replace('=', ''))
    Promise.each(parsedSecrets, async secret => {
      gh.rest.search.code({q: secret}).then(console.log)
    })
   

  })
  it.only('should find coinbase api key and secret in text', done => {
    const urls = [
      'https://github.com/cpatgo/funnel/blob/b4f07151fc2970fab3fd4ad7d09a0968e9c4636d/glc/bitcoin/index.php',
    ]
    Promise.map(urls, async url => {
      let text = await gh.request(`GET ${url}`).then(res => convert(res.data, {wordwrap: 130}))
      const apiKeyPrefixes = initApiKeyPrefixes().reduce((a, b) => [...a, ...b])
      const secretKeyPrefixes = initSecretKeyPrefixes().reduce((a, b) => [...a, ...b])
      console.log(secretKeyPrefixes.find(prefix => prefix === 'coinbaseAPISecret'))
      const initialSecretHits = secretKeyPrefixes.map(prefix => ({match: text.match(prefix, 'g'), prefix}))
      const initialHits = apiKeyPrefixes.map(prefix => ({match: text.match(prefix, 'g'), prefix}))
      let tmpTokens
      let tmpSecrets
      try {
        tmpTokens = initialHits.filter(hit => hit.match !== null).map(result => {

            const {match, prefix} = result
            const indexOfMatch = match['index']
            const input = match['input']
            let keyStringInitial = input.substring(indexOfMatch, indexOfMatch+16+(prefix.length+4))
            let potentialKey = clean(keyStringInitial.split(prefix)[1])
            console.log(potentialKey)
            if(potentialKey.length === 16) {
                return potentialKey
            }
        
        })
        console.log(tmpTokens)
        try {
        tmpSecrets = initialSecretHits.filter(hit => hit.match !== null).map(result => {
          const {match, prefix} = result
          const indexOfMatch = match['index']
          const input = match['input']
          let keyStringInitial = input.substring(indexOfMatch, indexOfMatch+32+(prefix.length+4))
          let potentialSecret = clean(keyStringInitial.split(prefix)[1])
          console.log(potentialSecret)
          if(potentialSecret.length === 32) {
              return potentialSecret
          }
        })
        }
        catch(err) {
          Sentry.captureException(err)
          console.log(err)
        }
    }
    catch(err){
      Sentry.captureException(err)
        console.log('error with tmpTokens', err)
    }
    return {tokens: unique(tmpTokens), secrets: unique(tmpSecrets)}
    }).then(console.log)
  })
  it('should remove repos', async () => {
    mongoose.model('repos').remove().then(console.log)
  })
  it('should get all topics from db', async () => {
    let topicArry = []
    mongoose.model('repos').find().then(res => {
      console.log('repos')
      res.forEach(item => {
        try {
          const {topics} = item.repo
          topics.forEach(topic => {
            topicArry.push(topic)
          })
        }
        catch(err) {
          return err
        }
      })
      console.log(unique(topicArry))
    })
  })
  it('should find api key in repo', async () => {
    const urls = [
      'https://github.com/DGKang234/ML_for_fun/blob/32284e92ce2c2cba258aecd9daea95497fb6cfe9/binance/binance_fitting_k_Larry.py',
      'https://github.com/SS-FS-58/arbitrage_bot/blob/16d26d68a364973b725ed15d6492e988e71a9cc8/binance_ccxt.py',
      'https://github.com/s260895/ada22/blob/23fe7b6bc248ef6ca133ff58401b7d1610ae7e62/price-fetch-ms/main.py'
    ]
    const url = "https://github.com/SS-FS-58/arbitrage_bot/blob/16d26d68a364973b725ed15d6492e988e71a9cc8/binance_ccxt.py"
    Promise.map(urls, async url => {
      let hits = 0
      let text = await gh.request(`GET ${url}`).then(res => convert(res.data, {wordwrap: 130}))
      return parseForBinanceKeys(text).then(tokens => {
        console.log('tokens for url', url)
        console.log(tokens)
      })
    })
        
   })
 
    

  })
  
  

  it('should add crypto accounts to db and save them', async () => {
    mongoose.model('binanceAccounts').create(
      {
      token: 'zyN3R5T1FOPwKLBvxnf09X6EkKzcIEBCes1RpNqD6moXU7YoqOBX3M2vFcUgCAQy',        
      secret: 'dQMgSnNJs3MrBvU5qx65WYmn7PIAK9o0LLjLLVmPicjjCsWTA3iFA6H9UwDKn55h',       
      cryptos: [
        { crypto: 'BTC', balance: 0.00754945 },
        { crypto: 'USDT', balance: 75.82065341 },
        { crypto: 'MATIC', balance: 35.8641 },
        { crypto: 'BUSD', balance: 113.1459823 },
        { crypto: 'SAND', balance: 9.98071452 },
        { crypto: 'LUNA', balance: 0.13644845 },
        { crypto: 'LUNC', balance: 0.00253 }
      ],
      
    }).then(doc => {
      console.log('got doc', doc)
      return doc.save()
    })
  })
  it('should fetch all crypto accounts from mongo', done => {
   mongoose.model('binanceAccounts').find({}).then(accounts => {
    //expect(accounts).to.not.be.undefined
    console.log('got accounts from db', accounts)
    done()
   }).catch(console.log)

  })
  it('should find all api secrets in code file', async () => {
    let url = 'https://github.com/snroptimus/crypto_bot/blob/68f399a3aaa5df3130a8882dc4a0243e6c4959d0/app/ArbitrageInterface.py'
    let exampleFile = await gh.request(`GET ${url}`).then(res => convert(res.data, {
      wordwrap: 130
    }))
    let secrets = []
    let allApiSecretIndices = [...exampleFile.matchAll(new RegExp('binanceSecret', 'gi'))].map(a => a.index)
    allApiSecretIndices.forEach(index => {
      let secret = exampleFile
      .substring(index, index+100)
      .replace(/[\r\n]/gm, '')
      .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '')
      .replace('binanceSecret', '') // i replace the prefix we're using wth an empty string
      .replace('=', '') // I replace the assignment operator. This is going to be either : or = depending on whether were inside an object or dealing with a variable. Either way, I replace it with an empty string.
      .split(' ')[1] // we dont want extra spaces either or our key will be one character off
      // .substring(0, 64) 
       //we'll get the api key string as is then parse out all special characters and line breaks as well as the /n character. Our goal is to get this into the purest form possible.
      // if it passes our base 64 test we push it


      secret.length === 64 ? secrets.push(secret): null
    })
    console.log('secrets', secrets)


  })
	it('should find api_key in code file', async () => {
    const exampleFile = await gh.request('GET https://github.com/QuangNamVu/thesis/blob/01a404de2dfb70f13f3e61a9a8f3b73c88d93502/src/crawl_data/ccxt_example.py').then(res => convert(res.data, {
      wordwrap: 130
    }))
    
    const potentialApiKeys = [...exampleFile.matchAll(new RegExp('apiKey', 'gi'))].map(a => a.index) // these are the start indexes of each occurence of apiKey. More work is needed to get the actual values.
    let apiKeys = [] // i'm going to have to remove all new lines now, line breaks and special characters.
    potentialApiKeys.forEach(index => {
      let apiKey = exampleFile
      .substring(index, index+100)
      .replace(/[\r\n]/gm, '')
      .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '')
      .replace('apiKey', '')
      .replace(' ', '')
      .substring(0, 64)
      console.log('api key test 2', apiKey)
      apiKey.length === 64 ? apiKeys.push(apiKey): null
    })
    console.log('apiKeys test 2', apiKeys)
    //filter out duplicates
    console.log(apiKeys.filter((a, b) => apiKeys.indexOf(a) === b))
  }) 
  
