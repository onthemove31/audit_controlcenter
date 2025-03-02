angular.module('auditApp')
    .controller('AdminController', ['$scope', '$http', '$timeout', 'AuthService', '$location',
        function($scope, $http, $timeout, AuthService, $location) {
            
            // Initialize controller state
            $scope.currentUser = AuthService.getCurrentUser();
            $scope.stats = { total: 0, audited: 0, activeAuditors: 0 };
            $scope.users = [];
            $scope.newUser = { username: '' };
            $scope.auditorStats = [];
            $scope.allocation = {
                inProgress: false,
                progress: 0,
                error: null
            };
            $scope.unallocatedCount = 0;

            // Pagination settings
            $scope.userPage = 1;
            $scope.usersPerPage = 8;
            $scope.allocPage = 1;
            $scope.allocPerPage = 8;

            // Add sorting variables
            $scope.sortKey = 'username';
            $scope.sortReverse = false;
            $scope.userSearch = '';

            // Pagination helper functions
            $scope.range = function(start, end) {
                return Array.from({length: (end - start + 1)}, (_, i) => start + i);
            };

            // User pagination
            $scope.getUserPages = function() {
                const filteredUsers = $scope.users.filter(user => 
                    user.username.toLowerCase().includes($scope.userSearch.toLowerCase())
                );
                return Math.ceil(filteredUsers.length / $scope.usersPerPage);
            };

            $scope.setUserPage = function(page) {
                if (page < 1 || page > $scope.getUserPages()) return;
                $scope.userPage = page;
            };

            // Allocation pagination
            $scope.getAllocPages = function() {
                return Math.ceil($scope.auditorStats.length / $scope.allocPerPage);
            };

            $scope.setAllocPage = function(page) {
                if (page < 1 || page > $scope.getAllocPages()) return;
                $scope.allocPage = page;
            };

            // Add sorting function
            $scope.setAuditorSort = function(key) {
                if ($scope.sortKey === key) {
                    $scope.sortReverse = !$scope.sortReverse;
                } else {
                    $scope.sortKey = key;
                    $scope.sortReverse = false;
                }
                // Reset to first page when sorting changes
                $scope.allocPage = 1;
            };

            // Watch for search changes to reset page
            $scope.$watch('userSearch', function() {
                $scope.userPage = 1;
            });

            // Load initial data
            loadDashboardStats();
            loadUsers();
            loadAuditorStats();
            updateUnallocatedCount();

            // User Management Functions
            function loadUsers() {
                console.log('Loading users...');
                $http.get('/api/admin/users')
                    .then(function(response) {
                        console.log('Raw users data:', response.data);
                        
                        $timeout(function() {
                            try {
                                const userData = response.data;
                                if (Array.isArray(userData)) {
                                    $scope.users = userData.map(user => ({
                                        id: user.id || 0,
                                        username: user.username || '',
                                        role: user.role || 'auditor'
                                    }));
                                } else {
                                    throw new Error('Server returned non-array data');
                                }
                            } catch (error) {
                                console.error('Error processing users:', error);
                                console.error('Received data:', response.data);
                                $scope.users = [];
                            }
                        });
                    })
                    .catch(function(error) {
                        console.error('Error loading users:', error);
                        $scope.users = [];
                    });
            }

            $scope.addUser = function() {
                if (!$scope.newUser.username) return;
                
                $http.post('/api/admin/users', $scope.newUser)
                    .then(function(response) {
                        console.log('User added:', response.data);
                        $scope.newUser.username = '';
                    })
                    .catch(function(error) {
                        console.error('Error adding user:', error);
                        alert(error.data.error || 'Failed to add user');
                    });
            };

            $scope.removeUser = function(userId) {
                if (!confirm('Are you sure you want to remove this user?')) return;
                
                $http.delete('/api/admin/users/' + userId)
                    .then(function() {
                        console.log('User removed successfully');
                    })
                    .catch(function(error) {
                        console.error('Error removing user:', error);
                        alert('Failed to remove user');
                    });
            };

            // Work Allocation Functions
            function updateUnallocatedCount() {
                $http.get('/api/admin/unallocated-count')
                    .then(response => {
                        $scope.unallocatedCount = response.data.count || 0;
                        console.log('Unallocated count:', $scope.unallocatedCount); // Debug log
                    })
                    .catch(error => {
                        console.error('Error getting unallocated count:', error);
                        $scope.unallocatedCount = 0;
                    });
            }

            let allocationSource = null;

            $scope.randomlyAssignWork = function() {
                if (!$scope.unallocatedCount) {
                    alert('No records available for allocation');
                    return;
                }

                if (!confirm('Are you sure you want to allocate ' + $scope.unallocatedCount + ' records?')) return;

                $scope.allocation.inProgress = true;
                $scope.allocation.error = null;

                $http.post('/api/admin/assign-random')
                    .then(response => {
                        console.log('Allocation response:', response.data); // Debug log
                        $scope.allocation.inProgress = false;
                        alert(`Successfully assigned ${response.data.assignedCount} records to ${response.data.auditorCount} auditors.`);
                    })
                    .catch(error => {
                        console.error('Allocation error:', error);
                        $scope.allocation.inProgress = false;
                        $scope.allocation.error = error.data?.error || 'Failed to allocate records';
                        alert($scope.allocation.error);
                    });
            };

            $scope.reAuditSelection = function() {
                if (!confirm('This will randomly select 10% of completed audits for re-audit by their original auditors. Continue?')) return;
                
                $http.post('/api/admin/reaudit-selection')
                    .then(response => {
                        alert(`Selected ${response.data.recordsSelected} records for re-audit.`);
                    })
                    .catch(error => {
                        console.error('Re-audit selection error:', error);
                        alert('Failed to select records for re-audit');
                    });
            };

            // Stats Functions
            function loadDashboardStats() {
                $http.get('/api/admin/stats')
                    .then(response => {
                        $scope.stats = response.data;
                    });
            }

            function loadAuditorStats() {
                console.log('Loading auditor stats...');
                $http.get('/api/admin/auditor-stats')
                    .then(function(response) {
                        console.log('Raw auditor stats:', response.data);
                        
                        // Simpler response handling without timeout
                        if (Array.isArray(response.data)) {
                            $scope.auditorStats = response.data.map(stat => ({
                                username: stat.username,
                                allocated: Number(stat.allocated) || 0,
                                pending: Number(stat.pending) || 0,
                                completed: Number(stat.completed) || 0
                            }));
                        } else {
                            console.error('Invalid auditor stats response:', response.data);
                            $scope.auditorStats = [];
                        }
                        console.log('Processed stats:', $scope.auditorStats);
                    })
                    .catch(function(error) {
                        console.error('Error loading auditor stats:', error);
                        $scope.auditorStats = [];
                    });
            }

            // Helper Functions
            $scope.getCompletionRate = function(stat) {
                if (!stat || !stat.allocated) return 0;
                return Math.round((Number(stat.completed) / Number(stat.allocated)) * 100);
            };

            $scope.getTotalAllocated = function() {
                if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
                return $scope.auditorStats.reduce((sum, stat) => sum + Number(stat.allocated), 0);
            };

            $scope.getTotalPending = function() {
                if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
                return $scope.auditorStats.reduce((sum, stat) => sum + Number(stat.pending), 0);
            };

            $scope.getTotalCompleted = function() {
                if (!$scope.auditorStats || !$scope.auditorStats.length) return 0;
                return $scope.auditorStats.reduce((sum, stat) => sum + Number(stat.completed), 0);
            };

            $scope.getOverallCompletionRate = function() {
                const total = $scope.getTotalAllocated();
                return total ? Math.round(($scope.getTotalCompleted() / total) * 100) : 0;
            };

            $scope.logout = function() {
                AuthService.logout();
                $location.path('/login');
            };

            // Update cleanup to only handle allocationSource
            $scope.$on('$destroy', function() {
                if (allocationSource) {
                    allocationSource.close();
                }
            });

            // File upload handling
            $scope.uploadFile = function(file) {
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                $scope.upload = {
                    inProgress: true,
                    progress: 0,
                    error: null
                };

                $http.post('/api/upload/csv', formData, {
                    transformRequest: angular.identity,
                    headers: {'Content-Type': undefined}
                })
                .then(response => {
                    $scope.upload.inProgress = false;
                    $scope.upload.success = true;
                    loadDashboardStats(); // Refresh stats after upload
                })
                .catch(error => {
                    $scope.upload.inProgress = false;
                    $scope.upload.error = error.data.error || 'Upload failed';
                });
            };

            // File input change handler
            $scope.handleFileSelect = function(element) {
                $scope.$apply(function() {
                    $scope.uploadFile(element.files[0]);
                });
            };

            // Initialize unallocated count
            updateUnallocatedCount();

            // Reset pagination when data changes
            const originalLoadUsers = loadUsers;
            loadUsers = function() {
                originalLoadUsers();
                $scope.userPage = 1;
            };

            const originalLoadAuditorStats = loadAuditorStats;
            loadAuditorStats = function() {
                originalLoadAuditorStats();
                $scope.allocPage = 1;
            };

            // Add manual refresh function
            $scope.refreshData = function() {
                loadDashboardStats();
                loadUsers();
                loadAuditorStats();
                updateUnallocatedCount();
            };

            $scope.exportRecords = function() {
                $http.get('/api/admin/export-records', { responseType: 'blob' })
                    .then(function(response) {
                        const blob = new Blob([response.data], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'audit_records_' + new Date().toISOString().split('T')[0] + '.csv';
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                    })
                    .catch(function(error) {
                        console.error('Export error:', error);
                        alert('Failed to export records');
                    });
            };

            $scope.selectedFile = null;
            $scope.uploading = false;
            $scope.uploadProgress = 0;

            $scope.fileSelected = function(element) {
                $scope.selectedFile = element.files[0];
                $scope.$apply();
            };

            $scope.uploadFile = function() {
                if (!$scope.selectedFile) return;

                const formData = new FormData();
                formData.append('file', $scope.selectedFile);
                
                $scope.uploading = true;
                $scope.uploadProgress = 0;

                $http.post('/api/admin/upload', formData, {
                    transformRequest: angular.identity,
                    headers: {'Content-Type': undefined},
                    uploadEventHandlers: {
                        progress: function(e) {
                            if (e.lengthComputable) {
                                $scope.uploadProgress = Math.round((e.loaded * 100) / e.total);
                            }
                        }
                    }
                })
                .then(response => {
                    alert(`Successfully uploaded ${response.data.recordsInserted} records`);
                    $scope.selectedFile = null;
                    document.getElementById('csvFile').value = '';
                })
                .catch(error => {
                    console.error('Upload error:', error);
                    alert('Upload failed: ' + (error.data?.error || 'Unknown error'));
                })
                .finally(() => {
                    $scope.uploading = false;
                });
            };
        }
    ]);
