import { Router } from 'express'
import { body } from 'express-validator'
import { changePassword, login, logout, me, updateProfile } from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'
import { handle, validate } from '../utils/http.js'

const router = Router()
router.post('/login', body('email').isEmail().withMessage('Enter a valid email address.'), body('password').isLength({ min: 1 }).withMessage('Enter your password.'), validate, handle(login))
router.post('/logout', authenticate, handle(logout))
router.get('/me', authenticate, handle(me))
router.put('/profile', authenticate, handle(updateProfile))
router.put(
  '/password',
  authenticate,
  body('current_password').isLength({ min: 1 }).withMessage('Enter your current password.'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
  validate,
  handle(changePassword)
)
export default router
