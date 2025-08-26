// controllers/userController.js
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';

const { genSalt, hash, compare } = bcrypt;
const { sign } = jwt;

/**
 * Generates JWT token for user authentication
 * @param {string} userId - User's MongoDB ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc     Register a new user
// @route    POST /api/users/register
// @access   Public
export async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, email, password, phoneNumber, userType } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    const salt = await genSalt(10);
    const hashedPassword = await hash(password, salt);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      phoneNumber,
      userType: userType || 'bidder',
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Authenticate user and get token
// @route    POST /api/users/login
// @access   Public
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      balance: user.balance,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Get user profile
// @route    GET /api/users/profile
// @access   Private
export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Update user profile
// @route    PUT /api/users/profile
// @access   Private
export async function updateProfile(req, res) {
  try {
    const { username, phoneNumber, profilePhoto, preferredPaymentMethod } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { username, phoneNumber, profilePhoto, preferredPaymentMethod },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Change user password
// @route    PUT /api/users/change-password
// @access   Private
export async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!(await compare(oldPassword, user.password))) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }

    const salt = await genSalt(10);
    user.password = await hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Update user token balance
// @route    PUT /api/users/balance
// @access   Private
export async function updateBalance(req, res) {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);

    if (amount < 0 && user.balance < Math.abs(amount)) {
      return res.status(400).json({ message: 'Insufficient token balance' });
    }

    user.balance += amount;
    await user.save();

    res.json({ newBalance: user.balance });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Verify user account (Admin only)
// @route    PUT /api/users/:userId/verify
// @access   Private/Admin
export async function verifyUser(req, res) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isVerified: true },
      { new: true }
    );

    res.json({ message: `User ${user.email} verified` });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Toggle user suspension status (Admin only)
// @route    PUT /api/users/:userId/suspend
// @access   Private/Admin
export async function toggleSuspension(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    user.isSuspended = !user.isSuspended;
    await user.save();

    res.json({ message: `User ${user.email} suspension: ${user.isSuspended}` });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// @desc     Delete user account
// @route    DELETE /api/users/profile
// @access   Private
export async function deleteAccount(req, res) {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
