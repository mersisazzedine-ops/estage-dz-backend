const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const protect = require('../middleware/authMiddleware');

// 1. Student submits an application
router.post('/', protect, applicationController.applyForInternship);

// 2. Company views their applications
router.get('/company', protect, applicationController.getCompanyApplications);

// 3. Company updates the status of an application (Notice the :id in the URL)
router.put('/:id/status', protect, applicationController.updateApplicationStatus);

module.exports = router;