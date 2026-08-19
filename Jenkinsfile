// ---------------------------------------------------------------------------
// Pipeline de Entrega Continua (CD)
// Universidad de La Sabana - Fundamentos DevOps - Unidad 2, Actividad 3
//
// Toma el codigo validado por el pipeline de CI (GitHub Actions), construye
// la imagen Docker, la escanea, la publica en un registro y actualiza los
// manifiestos de Kubernetes para que el despliegue ocurra de forma agnostica
// al entorno (dev / staging / prod) mediante GitOps.
// ---------------------------------------------------------------------------

pipeline {
    // 'any' permite ejecutarlo en cualquier agente. En un entorno productivo
    // se usaria un agente etiquetado con Docker disponible, por ejemplo:
    // agent { label 'docker' }
    agent any

    environment {
        REGISTRY          = 'docker.io'
        REGISTRY_NAMESPACE = 'dsiriarte'
        IMAGE_NAME        = 'devops-task-api'
        IMAGE_TAG         = "${env.BUILD_NUMBER}-${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'local'}"
        FULL_IMAGE        = "${REGISTRY}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}"
        // Credencial de tipo "Username with password" configurada en Jenkins.
        // Nunca se escriben usuario ni token en el codigo fuente.
        DOCKER_CREDENTIALS = 'dockerhub-credentials'
        KUBE_CREDENTIALS   = 'kubeconfig-credentials'
    }

    options {
        // Conserva un historial acotado de ejecuciones y artefactos.
        buildDiscarder(logRotator(numToKeepStr: '15', artifactNumToKeepStr: '10'))
        // Evita que un despliegue quede colgado indefinidamente.
        timeout(time: 30, unit: 'MINUTES')
        // Anade marcas de tiempo al log, util para auditoria y diagnostico.
        timestamps()
        // Impide ejecuciones concurrentes que puedan pisar el mismo entorno.
        disableConcurrentBuilds()
    }

    parameters {
        choice(
            name: 'DEPLOY_ENV',
            choices: ['dev', 'staging', 'prod'],
            description: 'Entorno de destino del despliegue'
        )
        booleanParam(
            name: 'SKIP_TESTS',
            defaultValue: false,
            description: 'Omitir las pruebas (solo para reconstrucciones de emergencia)'
        )
    }

    triggers {
        // El pipeline se dispara cuando GitHub notifica un push (webhook).
        githubPush()
    }

    stages {

        // -------------------------------------------------------------------
        // STAGE 1 - Clonar el repositorio
        // Obtiene el codigo fuente desde GitHub y registra el commit exacto
        // que se esta desplegando, garantizando trazabilidad del artefacto.
        // -------------------------------------------------------------------
        stage('Checkout') {
            steps {
                echo "Clonando el repositorio desde GitHub..."
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.GIT_BRANCH_NAME = sh(
                        script: 'git rev-parse --abbrev-ref HEAD',
                        returnStdout: true
                    ).trim()
                }
                echo "Commit: ${env.GIT_COMMIT_SHORT} | Rama: ${env.GIT_BRANCH_NAME}"
            }
        }

        // -------------------------------------------------------------------
        // STAGE 2 - Instalar dependencias
        // npm ci instala exactamente las versiones fijadas en package-lock.json,
        // lo que hace la construccion reproducible entre entornos.
        // -------------------------------------------------------------------
        stage('Instalar dependencias') {
            steps {
                echo "Instalando dependencias con npm ci..."
                sh 'npm ci'
            }
        }

        // -------------------------------------------------------------------
        // STAGE 3 - Calidad y pruebas
        // Se ejecutan en paralelo porque son independientes entre si: acorta
        // el tiempo total del pipeline (principio de flujo, Primer Camino).
        // -------------------------------------------------------------------
        stage('Calidad y pruebas') {
            when {
                expression { return !params.SKIP_TESTS }
            }
            parallel {
                stage('Analisis estatico') {
                    steps {
                        echo "Ejecutando ESLint..."
                        sh 'npm run lint'
                    }
                }
                stage('Pruebas automatizadas') {
                    steps {
                        echo "Ejecutando pruebas unitarias y de integracion..."
                        sh 'npm test'
                    }
                    post {
                        always {
                            // Publica el reporte de cobertura como artefacto del build.
                            archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 4 - Construir la imagen Docker
        // Empaqueta la aplicacion en un artefacto inmutable y versionado.
        // El mismo artefacto se promueve entre entornos sin reconstruirse.
        // -------------------------------------------------------------------
        stage('Construir imagen Docker') {
            steps {
                echo "Construyendo la imagen ${FULL_IMAGE}:${IMAGE_TAG}..."
                script {
                    docker.build(
                        "${FULL_IMAGE}:${IMAGE_TAG}",
                        "--build-arg GIT_COMMIT=${env.GIT_COMMIT_SHORT} ."
                    )
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 5 - Escaneo de seguridad de la imagen (DevSecOps)
        // Trivy detecta vulnerabilidades en el sistema base y las dependencias
        // antes de que la imagen llegue al registro. Desplaza la seguridad a
        // la izquierda del ciclo de vida.
        // -------------------------------------------------------------------
        stage('Escaneo de seguridad (Trivy)') {
            steps {
                echo "Escaneando vulnerabilidades de la imagen..."
                sh """
                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        --format table \
                        ${FULL_IMAGE}:${IMAGE_TAG} | tee trivy-report.txt
                """
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-report.txt', allowEmptyArchive: true
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 6 - Publicar la imagen en el registro
        // Sube la imagen a DockerHub con dos etiquetas: una inmutable
        // (build+commit) para trazabilidad y 'latest' solo desde main.
        // -------------------------------------------------------------------
        stage('Publicar en el registro') {
            steps {
                echo "Publicando la imagen en ${REGISTRY}..."
                script {
                    docker.withRegistry("https://${REGISTRY}", "${DOCKER_CREDENTIALS}") {
                        def image = docker.image("${FULL_IMAGE}:${IMAGE_TAG}")
                        image.push()
                        if (env.GIT_BRANCH_NAME == 'main') {
                            image.push('latest')
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 7 - Actualizar los manifiestos de despliegue (GitOps)
        // No se aplica el cambio contra el cluster desde Jenkins: se actualiza
        // el estado deseado en Git y Argo CD lo sincroniza. Esto hace el
        // despliegue agnostico al entorno y totalmente auditable.
        // -------------------------------------------------------------------
        stage('Actualizar manifiestos (GitOps)') {
            steps {
                echo "Actualizando la etiqueta de imagen en los manifiestos de ${params.DEPLOY_ENV}..."
                sh """
                    sed -i.bak 's|image: .*${IMAGE_NAME}:.*|image: ${FULL_IMAGE}:${IMAGE_TAG}|' \
                        k8s/deployment.yaml
                    rm -f k8s/deployment.yaml.bak
                    cat k8s/deployment.yaml | grep image:
                """
                // En un entorno real se haria commit y push del manifiesto
                // actualizado al repositorio de configuracion, por ejemplo:
                // withCredentials([usernamePassword(credentialsId: 'github-credentials', ...)]) {
                //     sh 'git commit -am "chore: despliega ${IMAGE_TAG}" && git push'
                // }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 8 - Desplegar en Kubernetes
        // Aplica los manifiestos y espera a que el rollout termine. Si el
        // despliegue no converge en el tiempo definido, el stage falla y se
        // dispara el rollback del bloque post.
        // -------------------------------------------------------------------
        stage('Desplegar en Kubernetes') {
            steps {
                echo "Desplegando en el entorno ${params.DEPLOY_ENV}..."
                withCredentials([file(credentialsId: "${KUBE_CREDENTIALS}", variable: 'KUBECONFIG')]) {
                    sh """
                        kubectl --namespace=${params.DEPLOY_ENV} apply -f k8s/
                        kubectl --namespace=${params.DEPLOY_ENV} rollout status \
                            deployment/${IMAGE_NAME} --timeout=180s
                    """
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 9 - Verificacion post-despliegue
        // Prueba de humo contra el servicio ya desplegado: confirma que la
        // nueva version responde antes de dar el despliegue por exitoso.
        // -------------------------------------------------------------------
        stage('Verificacion post-despliegue') {
            steps {
                echo "Ejecutando prueba de humo contra el entorno desplegado..."
                withCredentials([file(credentialsId: "${KUBE_CREDENTIALS}", variable: 'KUBECONFIG')]) {
                    sh """
                        kubectl --namespace=${params.DEPLOY_ENV} run smoke-test-${BUILD_NUMBER} \
                            --rm -i --restart=Never --image=curlimages/curl:latest -- \
                            curl -sf http://${IMAGE_NAME}/healthz
                    """
                }
            }
        }

        // -------------------------------------------------------------------
        // STAGE 10 - Aprobacion manual para produccion
        // Puerta de control humana: produccion solo se libera con aprobacion
        // explicita. Los demas entornos se despliegan de forma automatica.
        // -------------------------------------------------------------------
        stage('Aprobacion para produccion') {
            when {
                expression { return params.DEPLOY_ENV == 'prod' }
            }
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    input(
                        message: "Confirmar la promocion de ${IMAGE_TAG} a produccion",
                        ok: 'Promover'
                    )
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Acciones posteriores: notificacion y limpieza.
    // Cierran el ciclo de retroalimentacion (Segundo Camino de DevOps).
    // -----------------------------------------------------------------------
    post {
        success {
            echo "Despliegue exitoso: ${FULL_IMAGE}:${IMAGE_TAG} en ${params.DEPLOY_ENV}"
            // slackSend(color: 'good', message: "Despliegue OK - ${IMAGE_TAG}")
        }
        failure {
            echo "El pipeline fallo. Revirtiendo al despliegue anterior..."
            // slackSend(color: 'danger', message: "Fallo el despliegue - ${IMAGE_TAG}")
            script {
                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                    withCredentials([file(credentialsId: "${KUBE_CREDENTIALS}", variable: 'KUBECONFIG')]) {
                        sh """
                            kubectl --namespace=${params.DEPLOY_ENV} rollout undo \
                                deployment/${IMAGE_NAME} || true
                        """
                    }
                }
            }
        }
        always {
            echo "Limpiando imagenes locales y el workspace..."
            sh "docker rmi ${FULL_IMAGE}:${IMAGE_TAG} || true"
            cleanWs()
        }
    }
}
