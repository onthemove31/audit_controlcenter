app.controller('AuditController', function($scope, AuditService, NotificationService, $interval, $rootScope, $timeout) {
    $scope.currentPage = 1;
    $scope.totalPages = 0;
    $scope.pageSize = 10;
    $scope.completedCount = 0;
    $scope.startTime = new Date();
    $scope.timeRemaining = '8:00:00';
    
    function updateStats() {
        AuditService.getAuditorStats($rootScope.currentUser).then(function(response) {
            $scope.stats = response.data;
            $scope.completedCount = response.data.completed;
            $scope.pendingCount = response.data.pending;
            $scope.totalRecords = response.data.total;
            $scope.completionPercentage = Math.round((response.data.completed / response.data.total) * 100) || 0;
            // Calculate total pages here after getting total records
            $scope.totalPages = Math.ceil($scope.totalRecords / $scope.pageSize);
        });
    }

    function loadRecords() {
        console.log('Loading page:', $scope.currentPage); // Debug log
        AuditService.getRecords($scope.currentPage, $rootScope.currentUser)
            .then(function(response) {
                $scope.currentRecords = response.data;
                updateStats();
            })
            .catch(function(error) {
                console.error('Error loading records:', error);
                NotificationService.sendNotification('error', 'Failed to load records');
            });
    }
    
    $scope.saveAudit = function(record) {
        record.audit_date = new Date().toISOString();
        record.auditor = $rootScope.currentUser;
        
        AuditService.saveAudit(record).then(function(response) {
            NotificationService.sendNotification('success', 'Audit saved successfully');
            loadRecords(); // Refresh the records
        }).catch(function(error) {
            NotificationService.sendNotification('error', 'Failed to save audit');
        });
    };
    
    // Add auto-save functionality with debounce
    let saveTimeout;
    $scope.autoSave = function(record) {
        record.saveStatus = 'Saving...';
        
        // Clear existing timeout
        if (saveTimeout) {
            $timeout.cancel(saveTimeout);
        }
        
        // Set new timeout
        saveTimeout = $timeout(function() {
            record.audit_date = new Date().toISOString();
            record.auditor = $rootScope.currentUser;
            
            AuditService.saveAudit(record).then(function(response) {
                record.saveStatus = 'Saved successfully';
                updateStats(); // Update stats after successful save
                // Clear the status after 3 seconds
                $timeout(function() {
                    record.saveStatus = '';
                }, 3000);
            }).catch(function(error) {
                record.saveStatus = 'Error saving: ' + (error.data?.error || 'Unknown error');
            });
        }, 1000); // Wait 1 second after last change before saving
    };

    $scope.updateRiskReason = function(record) {
        if (record.risk_status !== 'Risky') {
            record.risk_reason = '';
        }
        $scope.autoSave(record);
    };
    
    $scope.nextPage = function() {
        if ($scope.currentPage < $scope.totalPages) {
            console.log('Moving to next page'); // Debug log
            $scope.currentPage++;
            loadRecords();
        }
    };
    
    $scope.previousPage = function() {
        if ($scope.currentPage > 1) {
            console.log('Moving to previous page'); // Debug log
            $scope.currentPage--;
            loadRecords();
        }
    };
    
    // Initialize with first page
    $scope.currentPage = 1;
    $scope.pageSize = 10;
    loadRecords();
    
    // Update time remaining
    $interval(function() {
        let now = new Date();
        let end = new Date($scope.startTime);
        end.setHours(end.getHours() + 8);
        let diff = end - now;
        $scope.timeRemaining = new Date(diff).toISOString().substr(11, 8);
    }, 1000);

    // Update stats every minute
    $interval(updateStats, 60000);
});

app.controller('AdminController', function($scope, AdminService, NotificationService) {
    // Initialize admin dashboard
    $scope.users = [];
    $scope.stats = {};
    $scope.exportFilter = {};
    $scope.metrics = {};
    
    // Add allocation status tracking
    $scope.allocation = {
        inProgress: false,
        progress: 0,
        message: '',
        unallocatedCount: 0
    };

    // Add upload progress tracking
    $scope.uploadProgress = {
        inProgress: false,
        percent: 0,
        message: ''
    };

    // Load initial data
    function loadDashboard() {
        AdminService.getStats().then(function(response) {
            $scope.totalRecords = response.data.total;
            $scope.auditedCount = response.data.audited;
            $scope.activeAuditors = response.data.activeAuditors;
            $scope.progressPercentage = (response.data.audited / response.data.total) * 100;
            $scope.metrics = response.data.metrics;
        });
        
        AdminService.getUsers().then(function(response) {
            $scope.users = response.data;
        });

        // Check for unallocated records
        AdminService.getUnallocatedCount().then(function(response) {
            $scope.allocation.unallocatedCount = response.data.count;
        });
    }
    
    // User management
    $scope.addUser = function() {
        if (!$scope.newUser || !$scope.newUser.username) {
            NotificationService.sendNotification('error', 'Username is required');
            return;
        }

        AdminService.addUser($scope.newUser)
            .then(function(response) {
                NotificationService.sendNotification('success', 'User added successfully');
                $scope.newUser = {}; // Clear the form
                loadDashboard();
            })
            .catch(function(error) {
                NotificationService.sendNotification('error', 
                    'Failed to add user: ' + (error.data.error || 'Unknown error'));
            });
    };
    
    $scope.removeUser = function(userId) {
        if (confirm('Are you sure you want to remove this user?')) {
            AdminService.removeUser(userId).then(function() {
                loadDashboard();
                NotificationService.sendNotification('success', 'User removed successfully');
            });
        }
    };
    
    // Data management
    $scope.uploadStatus = '';
    
    $scope.uploadCSV = function() {
        if (!$scope.csvFile) {
            NotificationService.sendNotification('error', 'Please select a file first');
            return;
        }
        
        if (!$scope.csvFile.name.toLowerCase().endsWith('.csv')) {
            NotificationService.sendNotification('error', 'Please select a CSV file');
            return;
        }

        $scope.uploadProgress.inProgress = true;
        $scope.uploadProgress.percent = 0;
        $scope.uploadProgress.message = 'Starting upload...';
        
        AdminService.uploadData($scope.csvFile, function(progress) {
            $scope.$apply(function() {
                $scope.uploadProgress.percent = progress;
                $scope.uploadProgress.message = `Uploading... ${progress}%`;
            });
        })
        .then(function(response) {
            $scope.uploadStatus = 'Success: ' + response.data.recordsInserted + ' records inserted';
            NotificationService.sendNotification('success', 
                'Data uploaded successfully: ' + response.data.recordsInserted + ' records inserted');
            $scope.csvFile = null;
            loadDashboard();
        })
        .catch(function(error) {
            $scope.uploadStatus = 'Error: ' + (error.data.error || 'Unknown error');
            NotificationService.sendNotification('error', 
                'Upload failed: ' + (error.data.error || 'Unknown error'));
        })
        .finally(function() {
            $scope.uploadProgress.inProgress = false;
            $scope.uploadProgress.message = '';
        });
    };
    
    $scope.exportData = function() {
        AdminService.generateReport($scope.exportFilter).then(function(response) {
            // Trigger file download
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'audit_export_' + new Date().toISOString() + '.csv';
            a.click();
        });
    };
    
    // Work allocation
    $scope.randomlyAssignWork = function() {
        if ($scope.allocation.inProgress) return;
        
        $scope.allocation.inProgress = true;
        $scope.allocation.progress = 0;
        $scope.allocation.message = 'Starting allocation...';

        AdminService.randomAssignment()
            .then(function(response) {
                NotificationService.sendNotification('success', 
                    `Allocated ${response.data.assignedCount} records to ${response.data.auditorCount} auditors`);
                loadDashboard();
            })
            .catch(function(error) {
                NotificationService.sendNotification('error', 
                    'Allocation failed: ' + (error.data?.error || 'Unknown error'));
            })
            .finally(function() {
                $scope.allocation.inProgress = false;
                $scope.allocation.message = '';
            });
    };

    // Add allocation progress update handler
    function updateAllocationProgress(progress) {
        $scope.$apply(function() {
            $scope.allocation.progress = progress.percent;
            $scope.allocation.message = `Allocated ${progress.current} of ${progress.total} records...`;
        });
    }

    // Initialize SSE for progress updates
    const progressSource = new EventSource('/api/admin/allocation-progress');
    progressSource.onmessage = function(event) {
        const progress = JSON.parse(event.data);
        updateAllocationProgress(progress);
    };

    // Cleanup on controller destroy
    $scope.$on('$destroy', function() {
        progressSource.close();
    });

    // Initialize dashboard
    loadDashboard();
    
    // Refresh dashboard every 5 minutes
    setInterval(loadDashboard, 300000);
});

app.controller('LoginController', function($scope, $location, $rootScope) {
    $scope.username = '';
    
    $scope.login = function() {
        // Store user info in rootScope for global access
        $rootScope.currentUser = $scope.username;
        $rootScope.role = $scope.username === 'admin' ? 'admin' : 'auditor';
        
        // Redirect based on role
        if ($rootScope.role === 'admin') {
            $location.path('/admin');
        } else {
            $location.path('/audit');
        }
    };
});
