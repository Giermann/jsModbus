
var jsModbus = require('../'),
    util = require('util');

jsModbus.setLogger(function (msg) { util.log(msg); });
var coils = [false,false,false,true,true,true,false];

var readInputRegHandler = function (centralId, firstReg, numRegs) {
  
  var resp = [];
  for (var i = firstReg; i < firstReg+numRegs; i += 1) {
    resp.push(i);
  }

  return [resp];

};

var writeRegHandler = function (centralId, regNumber, regValue) {
  console.log('write requested of ' + regNumber + ' value ' + regValue);
  return [params.param[0], params.param[1]];
};

var readCoilRegHandler = function (centralId, firstCoil, numCoils) {
  return [coils.slice(firstCoil, numCoils)];
}

jsModbus.createTCPServer(8000, '127.0.0.1', function (err, server) {

    if (err) {
        console.log(err);
        return;
    }

    server.addHandler(3, readInputRegHandler);
    server.addHandler(6, writeRegHandler);
    server.addHandler(1, readCoilRegHandler);
});


