'use strict';
let Twitter = require('twitter');
let fs = require('fs');
let CONFIG = require('./config');

let client, model;

function loadModel() {
  return JSON.parse(fs.readFileSync(CONFIG.model_path, 'utf8'));
}

function saveModel(model) {
  fs.writeFileSync(CONFIG.model_path, JSON.stringify(model, null, '  '));
}

function tweet(message) {
  return new Promise(function(resolve, reject) {
    client.post('statuses/update', {status: message}, function(error, tweet, response){
      if (error) {
        reject(error);
        console.log('TWEET ERROR:', error);
        return;
      }
      console.log('Tweeted:', message); 
      resolve(tweet);
    });
  });
}

function fetch(since, max) {
  return new Promise(function(resolve, reject) {  
    let params = {
      screen_name: CONFIG.from_user,
      count: 200,
      include_rts: false,
      trim_user: true
    }
    if (since) {
      params.since_id = since;
    }
    if (max) {
      params.max_id = max;
    }
    client.get('statuses/user_timeline', params, function(error, tweets){
      if (error) {
        console.log('FETCH ERROR:', error);
        reject(error);
        return;
      } 
      console.log('RECEIVED', tweets.length);
      resolve(tweets);
    });
  });
}


function fetchAll() {
  model = loadModel();

  let nextMax = false;
  let startingMin = model.newest;
  let matchingCount = 0;
  let totalCount = 0;
  var getMore = function(){
    fetch(startingMin, nextMax).then((tweets) => {
      if (tweets.length === 0) {
        // We are done, can save
        saveModel(model);
        console.log('Found', matchingCount, 'matching out of', totalCount, 'tweets');
        return;
      }

      tweets.forEach(function(tweet) {
        totalCount++;
        if (tweet.id > model.newest) {
          model.newest = tweet.id;
        }

        nextMax = tweet.id;

        if (tweet.text.match(CONFIG.filter)) {
          model.unused.push({id: tweet.id, text: tweet.text});
          matchingCount++;
        }
      });
      // Try to get more
      setTimeout(function(){
        getMore();
      }, 1000);
    });
  }

  getMore();

}

function postNext() {
  let model = loadModel();

  if (model.unused.length === 0) {
    model.unused = model.used;
    model.used = [];
  }

  let next = model.unused.shift();
  tweet(next.text).then(function(){
    model.used.push(next);
    saveModel(model);
  }, function(error){
    console.log('ERROR', error);
  });
}

function postRandom() {
  model = loadModel();

  if (model.unused.length === 0) {
    model.unused = model.used;
    model.used = [];
  }

  let index = Math.floor(Math.random() * model.unused.length);
  let next = model.unused.splice(index, 1)[0];

  tweet(next.text).then(function(){
    model.used.push(next);
    saveModel(model);
  }, function(error){
    console.log('ERROR', error);
  });
}

function checkRateLimits() {
  client.get('application/rate_limit_status', {resources: 'statuses'}, function(error, limits){
    if (error) {
      console.log('ERROR', error);
      return;
    }
    console.log(JSON.stringify(limits, null, ' '));
  });
}


if (process.argv.length < 3) {
  console.log("Please enter a command!");
  return;
}

client = new Twitter({
  consumer_key: CONFIG.consumer_key,
  consumer_secret: CONFIG.consumer_secret,
  access_token_key: CONFIG.access_token_key,
  access_token_secret: CONFIG.access_token_secret
});


let command = process.argv[2].toUpperCase();
if (command === 'POST') {
  postRandom();
} else if (command === 'FETCH') {
  fetchAll();
} else if (command === 'RATE') {
  checkRateLimits();
}

