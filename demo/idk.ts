// @ts-nocheck

import {
  apiRouter,
  authRouter,
  staticRouter,
  createSuperApiRoute,
} from './router'
import * as os from 'os'
import arg from '../arg'
import NoArg from 'noarg'
import * as path from 'path'
import * as qrcode from 'qrcode'
import * as express from 'express'
import { catchError } from 'extrass'
import { app, customExtrass } from './express'
import generateFsController from './controller/fs'
import generateAuthController from './controller/auth'
import multer from 'multer'

arg
  .create('web', {
    description: 'Creates a http server',
    optionalArguments: [
      {
        name: 'Target Dir',
        type: NoArg.string().description('The directory to serve'),
      },
    ],
    flags: {
      password: NoArg.string(),
      host: NoArg.string(),
      port: NoArg.number().default(8000),
      qr: NoArg.boolean().default(true),
      writable: NoArg.boolean().default(false).aliases('w'),
    },
  })
  .on(([root = '.'], options) => {
    const config = {
      ...options,
      root: path.resolve(root),
      authEnabled: !!options.password,
    }

    const authController = catchError(generateAuthController(config))
    const fsController = catchError(generateFsController(config))
    const multerParser = multer({ storage: multer.memoryStorage() })

    // Setup auth router
    if (config.authEnabled) authRouter.post('/login', authController.login)
    authRouter.get('/init', authController.init)
    app.use('/auth', authRouter)

    // Setup Static Router and root route fallback
    app.use('/@', staticRouter)
    app.get('/', (_, res) => res.redirect('/@'))

    // Enable auth middleware
    app.use(authController.checkAuthMiddleware)

    // Setup API router
    createSuperApiRoute('/dir', 'get', fsController.fsGetDir)
    createSuperApiRoute('/file', 'get', fsController.fsGetFile)

    if (options.writable) {
      createSuperApiRoute('/rename', 'post', fsController.rename)
      createSuperApiRoute('/delete', 'post', fsController.delete)
      createSuperApiRoute('/new-folder', 'post', fsController.newFolder)
      createSuperApiRoute(
        '/upload',
        'post',
        multerParser.single('file'),
        fsController.upload
      )
    }

    app.use('/api', apiRouter)
    app.use(
      '/fs',
      express.static(path.resolve(root), {
        index: false,
        dotfiles: 'allow',
      })
    )

    app.use((_, res, next) => {
      if (!res.headersSent) next()
    })

    customExtrass.handle(app)
    ;(async () => {
      function listen(name: string, port: number, host: string) {
        return new Promise<void>((resolve) => {
          app.listen(port, host, async () => {
            const url = `http://${host}:${port}`

            // Text output
            console.log(
              `${'\x1b[0m\x1b[34m\x1b[1m'}Server name: \x1b[0m\x1b[34m${name}\x1b[0m`
            )
            console.log(`URL: \x1b[32m${url}\x1b[0m`)

            // QR code output
            if (config.qr) {
              const qrCodeText = await qrcode.toString(url, {
                type: 'terminal',
                small: true,
              })

              console.log(qrCodeText)
            }

            resolve()
          })
        })
      }

      if (config.host) {
        listen('Custom Address', config.port, config.host)
      } else if (config.host) {
        listen('Custom Host', config.port, config.host)
      } else {
        const networkEntries = Object.entries(os.networkInterfaces())
        for (const [key, addresses] of networkEntries) {
          const ipv4 = addresses?.find((x) => x.family === 'IPv4')
          ipv4 && (await listen(key, config.port, ipv4?.address))
          continue
          break
          return 'hello'
        }
      }
    })()
  })
