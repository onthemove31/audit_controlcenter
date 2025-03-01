angular.module('auditApp')
    .controller('AuditController', ['$scope', '$http', '$location', 'AuthService', 
        function($scope, $http, $location, AuthService) {
            $scope.currentUser = AuthService.getCurrentUser();
            
            if (!$scope.currentUser) {
                $location.path('/login');
                return;
            }

            // Initialize basic data
            $scope.currentPage = 1;
            $scope.totalPages = 1;
            $scope.currentRecords = [];

            // Add logout function
            $scope.logout = function() {
                AuthService.logout();
                $location.path('/login');
            };

            // Load records for current user
            function loadRecords(page) {
                $http.get('/api/records', {
                    params: {
                        auditor: $scope.currentUser.username,
                        page: page
                    }
                })
                .then(function(response) {
                    $scope.currentRecords = response.data;
                })
                .catch(function(error) {
                    console.error('Error loading records:', error);
                });
            }

            // Initialize data
            loadRecords($scope.currentPage);
            
            // ...existing pagination code...
        }
    ]);
