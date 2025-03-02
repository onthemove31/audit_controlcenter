angular.module('auditApp')
    .controller('AuditController', ['$scope', '$http', '$location', 'AuthService', '$timeout',
        function($scope, $http, $location, AuthService, $timeout) {
            $scope.currentUser = AuthService.getCurrentUser();
            
            if (!$scope.currentUser) {
                $location.path('/login');
                return;
            }

            // Initialize basic data
            $scope.currentPage = 1;
            $scope.totalPages = 1;
            $scope.currentRecords = [];
            $scope.itemsPerPage = 10;

            // Add page size handling
            $scope.itemsPerPage = 10; // Default value

            $scope.changePageSize = function() {
                $scope.currentPage = 1; // Reset to first page
                loadRecords(1);
            };

            // Add logout function
            $scope.logout = function() {
                AuthService.logout();
                $location.path('/login');
            };

            // Load records for current user
            function loadRecords(page) {
                $http.get('/api/audit', {  // Changed from '/api/records' to '/api/audit'
                    params: {
                        auditor: $scope.currentUser.username,
                        page: page,
                        limit: $scope.itemsPerPage
                    }
                })
                .then(function(response) {
                    console.log('Records loaded:', response.data); // Add debug log
                    $scope.currentRecords = response.data.records;
                    $scope.totalPages = response.data.totalPages;
                    $scope.currentPage = response.data.currentPage;
                    $scope.totalRecords = response.data.total;
                })
                .catch(function(error) {
                    console.error('Error loading records:', error);
                    $scope.currentRecords = [];
                });
            }

            // Initialize data
            loadRecords($scope.currentPage);
            
            // Add save status tracking
            $scope.saveStatus = {};

            $scope.saveRecord = function(record) {
                if (!record || !record.id) return;
                
                $scope.saveStatus[record.id] = {
                    saving: true,
                    saved: false,
                    error: null
                };

                $http.post('/api/records/save', record)
                    .then(response => {
                        $scope.saveStatus[record.id] = {
                            saving: false,
                            saved: true,
                            savedAt: response.data.savedAt,
                            error: null
                        };
                        loadStats(); // Refresh stats after save
                    })
                    .catch(error => {
                        console.error('Save error:', error);
                        $scope.saveStatus[record.id] = {
                            saving: false,
                            saved: false,
                            error: error.data?.error || 'Failed to save'
                        };
                    });
            };

            // Add auto-save functionality
            $scope.autoSave = function(record) {
                if (!record) return;
                
                $scope.saveStatus[record.id] = {
                    saving: true,
                    saved: false,
                    error: null
                };

                record.auditor = $scope.currentUser.username;
                
                // If record is locked, only save DTC status
                if ($scope.isRecordLocked(record)) {
                    record = {
                        id: record.id,
                        auditor: record.auditor,
                        dtc_status: record.dtc_status
                    };
                }
                
                $http.post('/api/audit/save', record)  // Changed from '/api/records/save' to '/api/audit/save'
                    .then(response => {
                        $scope.saveStatus[record.id] = {
                            saving: false,
                            saved: true,
                            savedAt: response.data.savedAt
                        };
                        // Update stats after successful save
                        loadStats();
                    })
                    .catch(error => {
                        console.error('Save error:', error);
                        $scope.saveStatus[record.id] = {
                            saving: false,
                            saved: false,
                            error: 'Failed to save'
                        };
                    });
            };

            // Update risk reason handler
            $scope.updateRiskReason = function(record) {
                if (record.risk_status !== 'Risky') {
                    record.risk_reason = '';
                }
                $scope.autoSave(record);
            };

            // Update loadStats to handle time metrics and deadline information
            function loadStats() {
                $http.get('/api/audit/stats', {  // Changed from '/api/records/stats' to '/api/audit/stats'
                    params: { auditor: $scope.currentUser.username }
                })
                .then(response => {
                    $scope.stats = response.data;
                    $scope.completedCount = response.data.completed;
                    $scope.pendingCount = response.data.pending;
                    $scope.totalRecords = response.data.total;
                    $scope.completionPercentage = Math.round(($scope.completedCount / $scope.totalRecords) * 100) || 0;
                    $scope.timeRemaining = response.data.estimatedDaysRemaining + ' days';
                    $scope.elapsedTime = response.data.elapsedTime;
                    
                    // Update deadline warning colors
                    if (response.data.isPastDeadline) {
                        document.documentElement.style.setProperty('--deadline-color', 'var(--bs-danger)');
                    } else if (response.data.remainingDays < 7) {
                        document.documentElement.style.setProperty('--deadline-color', 'var(--bs-warning)');
                    } else {
                        document.documentElement.style.setProperty('--deadline-color', 'var(--bs-info)');
                    }
                })
                .catch(error => {
                    console.error('Error loading stats:', error);
                    $scope.stats = {
                        total: 0,
                        completed: 0,
                        pending: 0,
                        elapsedDays: 0,
                        recordsPerDay: 0,
                        estimatedDaysRemaining: 0,
                        elapsedTime: '0h 0m',
                        timeRemaining: 'N/A',
                        isPastDeadline: false
                    };
                });
            }

            // Call loadStats immediately and after changes
            loadStats();

            // Add auto-refresh for elapsed time
            const timeUpdateInterval = setInterval(() => {
                loadStats();
            }, 60000); // Update every minute

            // Clean up interval on controller destroy
            $scope.$on('$destroy', function() {
                clearInterval(timeUpdateInterval);
            });

            // Status display helper
            $scope.getSaveStatus = function(recordId) {
                const status = $scope.saveStatus[recordId];
                if (!status) return '';
                if (status.saving) return 'Saving...';
                if (status.error) return 'Error: ' + status.error;
                if (status.saved) {
                    const time = new Date(status.savedAt);
                    return 'Saved at ' + time.toLocaleTimeString();
                }
                return '';
            };

            // Add navigation functions
            $scope.nextPage = function() {
                if ($scope.currentPage < $scope.totalPages) {
                    loadRecords($scope.currentPage + 1);
                }
            };

            $scope.previousPage = function() {
                if ($scope.currentPage > 1) {
                    loadRecords($scope.currentPage - 1);
                }
            };

            $scope.goToPage = function(page) {
                if (page >= 1 && page <= $scope.totalPages) {
                    loadRecords(page);
                }
            };

            // Add search function with debounce
            let searchTimeout;
            $scope.search = function() {
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                searchTimeout = setTimeout(function() {
                    $scope.currentPage = 1;
                    loadRecords(1);
                    $scope.$apply();
                }, 300);
            };

            // Add pageRange function for pagination
            $scope.pageRange = function() {
                let start = Math.max(2, currentPage - 1);
                let end = Math.min(totalPages - 1, currentPage + 1);
                
                if (currentPage <= 2) {
                    end = Math.min(4, totalPages - 1);
                }
                if (currentPage >= totalPages - 1) {
                    start = Math.max(2, totalPages - 3);
                }
                
                let pages = [];
                for (let i = start; i <= end; i++) {
                    pages.push(i);
                }
                return pages;
            };

            $scope.isRecordLocked = function(record) {
                return record.dtc_status === 'Not Responsive' || record.dtc_status === 'Not English';
            };

            $scope.handleDTCStatusChange = function(record) {
                if ($scope.isRecordLocked(record)) {
                    // Clear all fields when Not Responsive or Not English is selected
                    record.brand_matches_website = '';
                    record.risk_status = '';
                    record.risk_reason = '';
                    record.redirects = '';
                    record.redirected_url = '';
                    record.comments = ''; // Clear comments as well
                }
                $scope.autoSave(record);
            };

            // Add URL normalization helper
            $scope.getNormalizedUrl = function(website) {
                if (!website) return '#';
                
                // Remove any existing protocol
                let url = website.replace(/^(https?:\/\/)?(www\.)?/, '');
                
                // Remove any trailing path or query parameters
                url = url.split('/')[0];
                
                // Add https protocol
                return 'https://' + url;
            };

            // Add URL display helper
            $scope.getDisplayUrl = function(website) {
                if (!website) return '';
                return website.replace(/^(https?:\/\/)?(www\.)?/, '');
            };

            // ...existing pagination code...
        }
    ]);
