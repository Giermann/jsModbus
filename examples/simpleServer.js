
var jsModbus = require('../'),
    util = require('util');

jsModbus.setLogger(function (msg) { util.log(msg); });

var readInputRegHandler = function (params) {
  
  var resp = [];
  for (var i = start; i < start+quant; i += 1) {
    resp.push(i);
  }

  return [resp];

};

var writeRegHandler = function (params) {
  console.log('write requested of ' + params.param[0] + ' value ' + params.param[1]);
  return [params.param[0], params.param[1]];
}

jsModbus.createTCPServer(8000, '127.0.0.1', function (err, server) {

    if (err) {
        console.log(err);
        return;
    }

    server.addHandler(4, readInputRegHandler);
    server.addHandler(6, writeRegHandler);
});


