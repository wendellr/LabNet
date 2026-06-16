/**
 * BGP Labs — Registry de laboratórios
 *
 * Para adicionar um novo lab:
 *   1. Crie o arquivo: backend/labs/lab-XX.js
 *   2. Exporte um objeto seguindo o schema abaixo
 *   3. Adicione require('./lab-XX') neste arquivo
 *
 * Schema obrigatório:
 * {
 *   id: Number,            // identificador único
 *   title: String,         // nome do lab
 *   topic: String,         // tópico BGP principal
 *   difficulty: String,    // 'Iniciante' | 'Intermediário' | 'Avançado'
 *   duration: String,      // ex: '45 min'
 *   routers: String[],     // lista de roteadores ex: ['R1','R2','R3','R4']
 *   links: Array[],        // conexões: ['R1','eth1','R2','eth1'] ou {from,to,type}
 *   frr_configs: Object,   // { ROUTER: 'frr config string' }
 *   verifications: Array,  // critérios técnicos avaliados no submit
 *   answerKey: Object,     // gabaritos das questões do desafio
 *   steps: Array,          // passos do roteiro
 *   challenge: Object,     // desafio final com questões
 * }
 */

const labs = {};

// Carrega todos os arquivos lab-*.js automaticamente
const fs = require('fs');
const path = require('path');

fs.readdirSync(__dirname)
  .filter(f => f.match(/^lab-\d+\.js$/))
  .sort()
  .forEach(file => {
    const lab = require(path.join(__dirname, file));
    labs[lab.id] = lab;
  });

module.exports = labs;
