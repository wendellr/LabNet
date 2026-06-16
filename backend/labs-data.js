/**
 * BGP Labs Data — Entry point modular
 *
 * Os labs ficam em backend/labs/lab-XX.js
 * Este arquivo apenas carrega o registry e exporta para compatibilidade.
 *
 * Para adicionar um novo lab:
 *   1. Crie backend/labs/lab-XX.js seguindo o schema
 *   2. Nenhuma outra alteração necessária — o registry carrega automaticamente
 */

module.exports = require('./labs/index.js');
