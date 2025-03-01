angular.module('auditApp')
    .controller('LoginController', ['$scope', '$location', 'AuthService', 
        function($scope, $location, AuthService) {
            // Redirect if already logged in
            if (AuthService.isAuthenticated()) {
                if (AuthService.isAdmin()) {
                    $location.path('/admin');
                } else {
                    $location.path('/audit');
                }
                return;
            }

            $scope.login = function() {
                if (!$scope.username) return;
                
                AuthService.login($scope.username)
                    .then(function(user) {
                        if (user.role === 'admin') {
                            $location.path('/admin');
                        } else {
                            $location.path('/audit');
                        }
                    })
                    .catch(function(error) {
                        $scope.error = error.data.error || 'Login failed';
                    });
            };
        }
    ]);
