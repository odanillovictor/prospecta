// Opções de segurança do container Docker do coletor (compartilhadas por server.mjs e testar.mjs).
/**
 * Endurecimento do container (menor privilégio). Desligue com COLETOR_DOCKER_HARDEN=0 só se algo quebrar.
 * - sem capacidades do kernel e sem escalada de privilégio;
 * - limites de memória, CPU e processos (um site malicioso não derruba o PC);
 * - nenhuma porta publicada; só a pasta da coleta é montada.
 */
export function dockerHardening() {
  if (process.env.COLETOR_DOCKER_HARDEN === '0') return ['--shm-size', '1g'];
  return [
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '512',
    '--memory', process.env.COLETOR_DOCKER_MEMORY || '2g',
    '--cpus', process.env.COLETOR_DOCKER_CPUS || '2',
    '--shm-size', '1g',
  ];
}
