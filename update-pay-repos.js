const { Worker, isMainThread, parentPort } = require('worker_threads')
const { execSync } = require('child_process')
const fs = require('fs')

if (isMainThread) {
  const workerCount = 6 // number of concurrent workers
  const workers = []

  const parentDirectory = `/Users/${process.env.USER}/Documents/repos/gds/pay` // pay workspace directory
  const prefix = 'pay-' // prefix to filter out non-pay projects in the workspace

  const directories = fs.readdirSync(parentDirectory, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith(prefix))
      .map(dirent => `${parentDirectory}/${dirent.name}`)

  const taskQueue = directories.slice()

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(__filename)
    worker.id = i
    workers.push(worker)
  }

  const assignTask = (worker) => {
    if (taskQueue.length > 0) {
      const task = taskQueue.shift()
      worker.postMessage({ task, id: worker.id })
    } else {
      worker.postMessage({ task: null, id: worker.id })
    }
  }

  workers.forEach(worker => {
    worker.on('message', result => {
      if (result !== null) {
        console.log(`worker ${worker.id} - ${result}`)
      }
      assignTask(worker) // assign the next task to the worker
    })
    assignTask(worker) // assign the first task to each worker
  })
} else {
  // worker logic
  parentPort.on('message', ({ task, id }) => {
    if (task === null) {
      parentPort.close()
      return
    }

    const isGitProject = fs.existsSync(`${task}/.git`)
    const pathParts = task.split("/")
    const lastPart = pathParts.pop()

    if (isGitProject) {
      const defaultBranch = execSync(`cd ${task} && git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`, { stdio: [] }).toString().trim()
      try {
        console.log(`worker ${id} - 📂 ${lastPart}`)
        execSync(`cd ${task} && git checkout ${defaultBranch}`, { stdio: [] })
        execSync(`cd ${task} && git pull`, { stdio: [] })
        parentPort.postMessage(`✅ ${lastPart} updated`)
      } catch (error) {
        parentPort.postMessage(`🚨 ${lastPart} error\n\n❌ ${error}`)
      }
    } else {
      parentPort.postMessage(`🚨 ${lastPart} is not a git project`)
    }
  })
}
